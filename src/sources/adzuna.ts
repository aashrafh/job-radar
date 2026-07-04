import type { JobListing } from '../types.js';

// Adzuna covers real national job boards, including UK, Australia, New Zealand,
// Germany, and the Netherlands - useful since RemoteOK/Arbeitnow/Jobicy skew
// remote-only. Requires a free app_id/app_key from https://developer.adzuna.com
// If not configured, this source is silently skipped (returns []).
const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;

const COUNTRIES = ['gb', 'au', 'nz', 'de', 'nl'];

export async function fetchAdzuna(query: string): Promise<JobListing[]> {
  if (!APP_ID || !APP_KEY) return [];

  const results: JobListing[] = [];

  for (const country of COUNTRIES) {
    const url =
      `https://api.adzuna.com/v1/api/jobs/${country}/search/1` +
      `?app_id=${encodeURIComponent(APP_ID)}` +
      `&app_key=${encodeURIComponent(APP_KEY)}` +
      `&results_per_page=20` +
      `&what=${encodeURIComponent(query)}` +
      `&content-type=application/json`;

    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as { results: any[] };

      for (const item of json.results || []) {
        results.push({
          id: String(item.id),
          source: `adzuna-${country}`,
          title: item.title,
          company: item.company?.display_name || 'Unknown',
          location: item.location?.display_name || country.toUpperCase(),
          remote: /remote/i.test(`${item.title} ${item.description || ''}`),
          url: item.redirect_url,
          description: String(item.description || ''),
          tags: item.category?.label ? [item.category.label] : [],
          postedAt: item.created,
        });
      }
    } catch {
      // One country failing shouldn't kill the whole run.
      continue;
    }
  }

  return results;
}
