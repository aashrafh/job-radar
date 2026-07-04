import type { JobListing } from '../types.js';

// Arbeitnow's public job board API. No key required.
// Leans EU/Germany-heavy, which is useful for your target markets there.
export async function fetchArbeitnow(): Promise<JobListing[]> {
  const res = await fetch('https://www.arbeitnow.com/api/job-board-api');
  if (!res.ok) throw new Error(`Arbeitnow request failed: ${res.status}`);

  const json = (await res.json()) as { data: any[] };

  return (json.data || []).map((item): JobListing => ({
    id: item.slug,
    source: 'arbeitnow',
    title: item.title,
    company: item.company_name,
    location: item.location || (item.remote ? 'Remote' : 'Unknown'),
    remote: Boolean(item.remote),
    url: item.url,
    description: String(item.description || '').replace(/<[^>]+>/g, ' '),
    tags: Array.isArray(item.tags) ? item.tags : [],
    postedAt: item.created_at ? new Date(item.created_at * 1000).toISOString() : undefined,
  }));
}
