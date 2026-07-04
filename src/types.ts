export interface JobListing {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  description: string;
  tags: string[];
  postedAt?: string;
}

export interface ScoredJob extends JobListing {
  score: number;
  visaSignal: 'mentioned' | 'unclear' | 'none';
  reason: string;
}
