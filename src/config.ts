import dotenv from "dotenv";
import { Config, Tier2Company } from "./types.js";

dotenv.config();

// Tier 2 companies - curated list from AndrewStetsenko/tech-jobs-with-relocation
// NOTE: These require correct company board tokens. 
// Currently disabled due to token validation issues.
// To enable, find the correct Greenhouse/Lever/Ashby tokens for each company.
const DEFAULT_TIER2_COMPANIES: Tier2Company[] = [];

function parseStringList(envVar: string): string[] {
  return envVar
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function loadConfig(): Config {
  const config: Config = {
    adzuna: {
      appId: process.env.ADZUNA_APP_ID || "",
      appKey: process.env.ADZUNA_APP_KEY || "",
    },
    zai: {
      apiKey: process.env.ZAI_API_KEY || "",
      apiUrl:
        process.env.ZAI_API_URL ||
        "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    },
    scoring: {
      minScoreThreshold: parseInt(process.env.MIN_SCORE_THRESHOLD || "60", 10),
      maxJobsPerRun: parseInt(process.env.MAX_JOBS_PER_RUN || "50", 10),
    },
    targetCountries: parseStringList(
      process.env.TARGET_COUNTRIES ||
        "UK,Germany,Netherlands,Portugal,Australia,New Zealand,Ireland,Spain,Estonia,Lithuania,Canada",
    ),
    roleKeywords: parseStringList(
      process.env.ROLE_KEYWORDS ||
        "senior,lead,staff,principal,frontend,full-stack,fullstack,react,vue,angular,typescript,javascript",
    ),
    excludeKeywords: parseStringList(
      process.env.EXCLUDE_KEYWORDS || "junior,intern,entry,graduate,trainee",
    ),
    userProfile: {
      yearsExperience: parseInt(process.env.USER_YEARS_EXPERIENCE || "8", 10),
      primarySkills: parseStringList(
        process.env.USER_PRIMARY_SKILLS ||
          "React,TypeScript,JavaScript,Node.js,GraphQL",
      ),
      secondarySkills: parseStringList(
        process.env.USER_SECONDARY_SKILLS ||
          "Vue,Angular,Python,AWS,Docker,CI/CD",
      ),
      targetLevels: parseStringList(
        process.env.USER_TARGET_LEVELS || "Senior,Staff,Principal,Lead",
      ),
    },
    tier2Companies: DEFAULT_TIER2_COMPANIES,
  };

  // Validate critical config
  if (!config.zai.apiKey) {
    throw new Error("ZAI_API_KEY is required in environment variables");
  }

  // Only validate Adzuna if user wants to use it
  if (config.adzuna.appId || config.adzuna.appKey) {
    if (!config.adzuna.appId || !config.adzuna.appKey) {
      console.warn(
        "Warning: Adzuna API requires both ADZUNA_APP_ID and ADZUNA_APP_KEY. Adzuna will be skipped.",
      );
    }
  }

  return config;
}

// Export profile for scoring function
export const profile = {
  currentRole: "Senior Frontend Developer",
  yearsExperience: 8,
  coreSkills: ["React", "TypeScript", "JavaScript", "Node.js", "GraphQL"],
  targetRoleKeywords: ["senior", "lead", "staff", "principal", "frontend", "full-stack", "fullstack"],
  targetCountries: ["UK", "Germany", "Netherlands", "Portugal", "Australia", "New Zealand", "Ireland", "Spain", "Estonia", "Lithuania", "Canada"],
  needsSponsorship: true,
  proofPoints: [
    "8+ years of frontend development experience",
    "Expert in React, TypeScript, and modern JavaScript",
    "Strong full-stack experience with Node.js and GraphQL",
    "Experience with cloud services (AWS) and DevOps",
    "Proven track record of leading frontend teams",
    "Multiple successful project launches at scale"
  ]
};
