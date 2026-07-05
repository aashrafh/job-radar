import axios from "axios";
import { JobListing, ScoredJob, Config } from "./types.js";

interface ZAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ScoreResult {
  fitScore: number;
  visaSignal: boolean;
  reason: string;
}

// Fallback scoring function when API is unavailable
function scoreJobWithFallback(
  job: JobListing,
  config: Config,
  errorMessage: string,
): ScoreResult {
  const title = job.title.toLowerCase();
  const description = job.description.toLowerCase();
  const location = job.location.toLowerCase();

  // Get user profile data
  const primarySkills = config.userProfile.primarySkills.map((s) =>
    s.toLowerCase(),
  );
  const secondarySkills = config.userProfile.secondarySkills.map((s) =>
    s.toLowerCase(),
  );
  const targetLevels = config.userProfile.targetLevels.map((s) =>
    s.toLowerCase(),
  );
  const targetCountries = config.targetCountries.map((c) => c.toLowerCase());

  let fitScore = 0;
  let matchedSkills: string[] = [];

  // Check for target level keywords (25 points max)
  for (const level of targetLevels) {
    if (title.includes(level)) {
      fitScore += 25;
      break;
    }
  }

  // Check for primary skills (40 points max, 10 per skill)
  for (const skill of primarySkills) {
    if (title.includes(skill) || description.includes(skill)) {
      fitScore += 10;
      matchedSkills.push(skill);
    }
  }

  // Check for secondary skills (20 points max, 5 per skill)
  for (const skill of secondarySkills) {
    if (title.includes(skill) || description.includes(skill)) {
      fitScore += 5;
      matchedSkills.push(skill);
    }
  }

  // Check for location match (15 points)
  for (const country of targetCountries) {
    if (location.includes(country)) {
      fitScore += 15;
      break;
    }
  }

  // Check for visa sponsorship signals
  const visaKeywords = [
    "visa",
    "sponsorship",
    "relocation",
    "international",
    "global",
    "remote worldwide",
    "anywhere",
  ];
  const hasVisaSignal = visaKeywords.some(
    (keyword) => description.includes(keyword) || title.includes(keyword),
  );

  // Bonus for visa sponsorship
  if (hasVisaSignal) {
    fitScore += 10;
  }

  // Cap at 100
  fitScore = Math.min(100, Math.max(0, fitScore));

  const reason =
    matchedSkills.length > 0
      ? `Fallback scoring: matched ${matchedSkills.slice(0, 3).join(", ")}, ${matchedSkills.length > 3 ? `+${matchedSkills.length - 3} more` : ""}`
      : "Fallback scoring: basic keyword matching";

  return {
    fitScore,
    visaSignal: hasVisaSignal,
    reason: `${reason} (API unavailable: ${errorMessage})`,
  };
}

async function scoreJobWithRetry(
  job: JobListing,
  config: Config,
  maxRetries = 3,
  initialDelay = 5000,
): Promise<ScoreResult> {
  const prompt = `You are evaluating a job posting for fit against a candidate's profile.

Candidate Profile:
- Years of Experience: ${config.userProfile.yearsExperience}
- Primary Skills: ${config.userProfile.primarySkills.join(", ")}
- Secondary Skills: ${config.userProfile.secondarySkills.join(", ")}
- Target Levels: ${config.userProfile.targetLevels.join(", ")}

Job Posting:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Description: ${job.description.substring(0, 2000)}...

Task: Evaluate this job's fit for the candidate and provide:
1. A fit score from 0-100 based on:
   - Skills match (primary skills weighted higher)
   - Experience level alignment
   - Role seniority match
   - Location/country match with target countries
2. Whether the job mentions visa sponsorship, relocation support, or hiring international candidates
3. A one-line reason for the score

Respond in this exact JSON format:
{
  "fitScore": number between 0-100,
  "visaSignal": boolean,
  "reason": "one-line explanation"
}

Be strict with scoring - only give high scores (80+) for excellent matches on skills, experience, and location.`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log("config.zai.apiKey:", config, config.zai.apiKey);
      const response = await axios.post<ZAIResponse>(
        config.zai.apiUrl,
        {
          model: "glm-4.7",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 300,
        },
        {
          headers: {
            Authorization: `Bearer ${config.zai.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      console.log(`Z.AI API response for job ${job.id}:`, content);

      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      console.log(`Z.AI API response for job ${job.id}:`, jsonMatch);

      const result = JSON.parse(jsonMatch[0]) as ScoreResult;

      console.log(`Parsed result for job ${job.id}:`, result);

      // Validate the result
      if (
        typeof result.fitScore !== "number" ||
        result.fitScore < 0 ||
        result.fitScore > 100
      ) {
        throw new Error("Invalid fitScore in response");
      }
      if (typeof result.visaSignal !== "boolean") {
        throw new Error("Invalid visaSignal in response");
      }
      if (typeof result.reason !== "string") {
        throw new Error("Invalid reason in response");
      }

      return result;
    } catch (error) {
      console.log(error);
      const isAxiosError =
        error && typeof error === "object" && "isAxiosError" in error;
      const status =
        isAxiosError && "response" in error
          ? (error as any).response?.status
          : null;
      const errorData =
        isAxiosError && "response" in error
          ? (error as any).response?.data?.error
          : null;
      const errorCode = errorData?.code || null;

      console.table({
        errorData,
      });

      throw new Error(`Error scoring job ${job.id}: ${error}`);

      // Check for specific rate limit errors
      if (status === 429) {
        let reason = "API rate limit exceeded";

        // Provide more specific error messages based on error codes
        if (errorCode === "1113") {
          reason =
            "Insufficient balance or no resource package - please recharge";
        } else if (errorCode === "1302") {
          reason = "Rate limit reached - too many requests";
        } else if (errorCode === "1305") {
          reason = "Service temporarily overloaded - please try again later";
        } else if (errorCode === "1308" || errorCode === "1310") {
          reason = "Usage limit reached - will reset at next billing period";
        } else if (errorCode && errorCode.startsWith("13")) {
          reason = `API limit reached (code ${errorCode}) - check your account status`;
        }

        if (attempt < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, attempt); // Exponential backoff
          console.warn(
            `Rate limited for job ${job.id} (${reason}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // If we've exhausted retries, use fallback scoring
        console.error(
          `Rate limit exhausted for job ${job.id} after ${maxRetries} attempts: ${reason}`,
        );
        console.warn(`  → Using fallback scoring for ${job.title}`);
        return scoreJobWithFallback(job, config, reason);
      }

      // Check for authentication errors - these can't be retried
      if (status === 401) {
        console.error(
          `Authentication failed for job ${job.id}: ${errorCode === "1003" ? "Token expired" : "Invalid credentials"}`,
        );
        console.warn(`  → Using fallback scoring for ${job.title}`);
        return scoreJobWithFallback(job, config, "Authentication failed");
      }

      // For other errors or if we've exhausted retries, use fallback scoring
      if (attempt === maxRetries - 1) {
        console.error(`Error scoring job ${job.id}:`, error);
        console.warn(`  → Using fallback scoring for ${job.title}`);
        return scoreJobWithFallback(job, config, "API error");
      }

      throw error;
    }
  }

  // This should never be reached, but TypeScript needs it
  return {
    fitScore: 0,
    visaSignal: false,
    reason: "Scoring failed - unknown error",
  };
}

export async function scoreJob(
  job: JobListing,
  config: Config,
): Promise<ScoreResult> {
  return scoreJobWithRetry(job, config);
}

export async function scoreJobs(
  jobs: JobListing[],
  config: Config,
  onProgress?: (current: number, total: number) => void,
): Promise<ScoredJob[]> {
  const scoredJobs: ScoredJob[] = [];
  const maxJobs = config.scoring.maxJobsPerRun;
  const jobsToScore = jobs.slice(0, maxJobs);

  console.log(`Scoring ${jobsToScore.length} jobs (max ${maxJobs})...`);
  console.log(
    `Note: Scoring uses Z.AI API. If rate limits are reached, fallback scoring will be used.`,
  );

  for (let i = 0; i < jobsToScore.length; i++) {
    const job = jobsToScore[i];
    const result = await scoreJob(job, config);

    scoredJobs.push({
      ...job,
      fitScore: result.fitScore,
      visaSignal: result.visaSignal,
      reason: result.reason,
    });

    if (onProgress) {
      onProgress(i + 1, jobsToScore.length);
    }

    // Longer delay to avoid rate limiting (15 seconds between jobs)
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }

  // Sort by fit score descending
  scoredJobs.sort((a, b) => b.fitScore - a.fitScore);

  console.log(
    `Scoring complete. Best score: ${scoredJobs[0]?.fitScore || 0}, Worst: ${scoredJobs[scoredJobs.length - 1]?.fitScore || 0}`,
  );
  return scoredJobs;
}
