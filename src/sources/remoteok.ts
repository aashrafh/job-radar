import type { JobListing } from '../types.js';

// RemoteOK's public API. No key required. First element of the response
// is a legal notice, not a job - it gets filtered out below.
export async function fetchRemoteOK(): Promise<JobListing[]> {
  const res = await fetch('https://remoteok.com/api', {
    headers: { 'User-Agent': 'job-radar-cli (personal job search tool)' },
  });
  if (!res.ok) throw new Error(`RemoteOK request failed: ${res.status}`);

  const data = (await res.json()) as any[];

  return data
    .filter((item) => item && item.id && item.position)
    .map((item): JobListing => ({
      id: String(item.id),
      source: 'remoteok',
      title: item.position,
      company: item.company ?? 'Unknown',
      location: item.location || 'Remote',
      remote: true,
      url: item.url || `https://remoteok.com/remote-jobs/${item.id}`,
      description: String(item.description || '').replace(/<[^>]+>/g, ' '),
      tags: Array.isArray(item.tags) ? item.tags : [],
      postedAt: item.date,
    }));
}
