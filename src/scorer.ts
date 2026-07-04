import type { JobListing, ScoredJob } from "./types.js";
import { profile } from "./config.js";

// Z.AI's OpenAI-compatible endpoint. No SDK needed - plain fetch, same as
// the job sources.
const ZAI_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const API_KEY = process.env.ZAI_API_KEY;

// GLM-4.7-Flash is free (rate-limited, not just a trial credit), which
// fits bulk screening well since this runs against every new listing.
// Bump ZAI_MODEL to glm-5.2 in .env if you want sharper judgment on
// borderline cases - it costs per-token but you're only scoring new jobs.
const MODEL = process.env.ZAI_MODEL || "glm-4.7-flash";

function buildPrompt(job: JobListing): string {
  return `You are screening a job listing for fit against a candidate profile. Respond with ONLY a raw JSON object - no markdown fences, no preamble, no explanation outside the JSON.

CANDIDATE PROFILE:
- Current role: ${profile.currentRole}, ~${profile.yearsExperience} years experience
- Core skills: ${profile.coreSkills.join(", ")}
- Wants roles matching: ${profile.targetRoleKeywords.join(", ")}
- Target countries: ${profile.targetCountries.join(", ")}
- REQUIRES visa sponsorship or relocation support: ${profile.needsSponsorship}
- Key proof points:
${profile.proofPoints.map((p) => `  - ${p}`).join("\n")}

JOB LISTING:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Remote: ${job.remote}
Tags: ${job.tags.join(", ")}
Description (may be truncated): ${job.description.slice(0, 1500)}

Return JSON with exactly these keys:
{
  "score": <integer 0-100, overall fit for this specific candidate>,
  "visaSignal": "<one of: mentioned, unclear, none - does the listing mention visa sponsorship or relocation support>",
  "reason": "<one plain sentence explaining the score, no fluff>"
}`;
}

export async function scoreJob(job: JobListing): Promise<ScoredJob> {
  if (!API_KEY) throw new Error("ZAI_API_KEY is not set");

  const res = await fetch(ZAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: buildPrompt(job) }],
      temperature: 0.2,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Z.AI request failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  const text = (data.choices?.[0]?.message?.content || "")
    .replace(/```json|```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(text);
    console.log(`Scored job ${job.title} at ${job.company}:`, parsed.score);
    return {
      ...job,
      score: Number(parsed.score) || 0,
      visaSignal:
        parsed.visaSignal === "mentioned" || parsed.visaSignal === "none"
          ? parsed.visaSignal
          : "unclear",
      reason: parsed.reason || "",
    };
  } catch {
    return {
      ...job,
      score: 0,
      visaSignal: "unclear",
      reason: "Could not parse model response",
    };
  }
}

// Scores jobs a few at a time rather than all at once, to stay well within
// rate limits (this matters more on the free tier). One job hitting a rate
// limit or a parsing hiccup doesn't take down the rest of the batch - it's
// just recorded as a zero-score miss so the run keeps going.
export async function scoreJobs(
  jobs: JobListing[],
  concurrency = 3,
): Promise<ScoredJob[]> {
  const results: ScoredJob[] = [];
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const scored = await Promise.all(
      batch.map(async (job) => {
        try {
          return await scoreJob(job);
        } catch (err) {
          return {
            ...job,
            score: 0,
            visaSignal: "unclear" as const,
            reason: `Scoring failed: ${(err as Error).message}`,
          };
        }
      }),
    );
    results.push(...scored);
  }
  return results;
}
