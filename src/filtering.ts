import { JobListing, Config } from './types.js';

export function filterJobs(jobs: JobListing[], config: Config): JobListing[] {
  const filtered = jobs.filter(job => {
    // Skip jobs with missing required fields
    if (!job.title || !job.location) {
      return false;
    }

    // Exclude junior/entry level positions
    const titleLower = job.title.toLowerCase();
    const hasExcludeKeyword = config.excludeKeywords.some(keyword => 
      titleLower.includes(keyword.toLowerCase())
    );
    if (hasExcludeKeyword) {
      return false;
    }

    // Include jobs with relevant role keywords
    const hasIncludeKeyword = config.roleKeywords.some(keyword =>
      titleLower.includes(keyword.toLowerCase())
    );
    if (!hasIncludeKeyword) {
      return false;
    }

    // Filter by target countries
    const locationLower = job.location.toLowerCase();
    const matchesCountry = config.targetCountries.some(country =>
      locationLower.includes(country.toLowerCase()) ||
      locationLower.includes(country.toLowerCase().replace(/\s+/g, ''))
    );
    
    // Allow remote jobs regardless of country
    const isRemote = job.remote || locationLower.includes('remote');
    if (!isRemote && !matchesCountry) {
      return false;
    }

    return true;
  });

  console.log(`Filtered ${jobs.length} jobs down to ${filtered.length} matching criteria`);
  return filtered;
}
