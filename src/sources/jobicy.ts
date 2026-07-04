import type { JobListing } from '../types.js';

// Jobicy's public API. No key required. Remote-only listings.
export async function fetchJobicy(): Promise<JobListing[]> {
  const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=50');
  if (!res.ok) throw new Error(`Jobicy request failed: ${res.status}`);

  const json = (await res.json()) as { jobs: any[] };

  return (json.jobs || []).map((item): JobListing => ({
    id: String(item.id),
    source: 'jobicy',
    title: item.jobTitle,
    company: item.companyName,
    location: item.jobGeo || 'Remote',
    remote: true,
    url: item.url,
    description: String(item.jobExcerpt || item.jobDescription || '').replace(/<[^>]+>/g, ' '),
    tags: Array.isArray(item.jobIndustry) ? item.jobIndustry : [],
    postedAt: item.pubDate,
  }));
}
