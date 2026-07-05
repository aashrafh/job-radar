// Core data model for job listings
export interface JobListing {
  id: string;
  source: string; // 'remoteok' | 'arbeitnow' | 'jobicy' | 'adzuna' | 'greenhouse' | 'lever' | 'ashby'
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  description: string;
  tags: string[];
  salary?: string;
  postedDate?: Date;
}

// Scored job with LLM evaluation
export interface ScoredJob extends JobListing {
  fitScore: number; // 0-100
  visaSignal: boolean; // whether job mentions sponsorship/relocation
  reason: string; // one-line explanation of the score
}

// Configuration interfaces
export interface Config {
  adzuna: {
    appId: string;
    appKey: string;
  };
  zai: {
    apiKey: string;
    apiUrl: string;
  };
  scoring: {
    minScoreThreshold: number;
    maxJobsPerRun: number;
  };
  targetCountries: string[];
  roleKeywords: string[];
  excludeKeywords: string[];
  userProfile: UserProfile;
  tier2Companies: Tier2Company[];
}

export interface UserProfile {
  yearsExperience: number;
  primarySkills: string[];
  secondarySkills: string[];
  targetLevels: string[];
}

// User profile for scoring
export interface Profile {
  currentRole: string;
  yearsExperience: number;
  coreSkills: string[];
  targetRoleKeywords: string[];
  targetCountries: string[];
  needsSponsorship: boolean;
  proofPoints: string[];
}

export interface Tier2Company {
  name: string;
  ats: "greenhouse" | "lever" | "ashby";
  token: string; // board token for Greenhouse, slug for Lever/Ashby
  countries: string[];
  url: string;
}

// ATS-specific types
export interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  content: string;
  departments?: Array<{ name: string }>;
  metadata?: Array<{ name: string; value: string | string[] }>;
}

export interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  categories: {
    commitment: string;
    department: string;
    location: string;
    team: string;
  };
  description: string;
  descriptionPlain: string;
  lists?: Array<{ text: string; content: string[] }>;
}

export interface AshbyJob {
  title: string;
  locationId: string;
  locationName: string;
  jobId: string;
  descriptionHtml: string;
  descriptionMarkdown: string;
  employmentType: string;
  compensation?: {
    formattedMinCompensation: string;
    formattedMaxCompensation: string;
  };
}

  // Adzuna-specific types
  export interface AdzunaJob {
    id: string;
    title: string;
    description: string;
    location: {
      display_name: string;
      area: string[];
    };
    company: {
      display_name: string;
    };
    redirect_url: string;
    salary_min?: number;
    salary_max?: number;
    salary_is_predicted?: string;
    created: string;
    contract_time?: string;
    category?: {
      tag: string;
    };
  }

// Storage interfaces
export interface SeenJobsCache {
  [jobId: string]: {
    timestamp: number;
    score: number;
  };
}

export interface JobRunResult {
  totalFetched: number;
  afterFiltering: number;
  afterDeduping: number;
  scored: number;
  aboveThreshold: number;
  jobs: ScoredJob[];
  runDate: Date;
}
