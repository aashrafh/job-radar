import axios from 'axios';
import { JobListing, LeverJob } from '../../types.js';

export async function fetchLeverJobs(companySlug: string, companyName: string): Promise<JobListing[]> {
  try {
    const response = await axios.get<{ postings: LeverJob[] }>(
      `https://api.lever.co/v0/postings/${companySlug}?mode=json`
    );
    
    if (!response.data.postings) {
      return [];
    }
    
    return response.data.postings.map((job: LeverJob) => ({
      id: `lever-${companySlug}-${job.id}`,
      source: `lever-${companySlug}`,
      title: job.text,
      company: companyName,
      location: job.categories.location,
      remote: job.categories.location.toLowerCase().includes('remote') || 
              job.categories.location.toLowerCase().includes('anywhere'),
      url: job.hostedUrl,
      description: job.descriptionPlain || job.description,
      tags: [job.categories.department, job.categories.team, job.categories.commitment].filter(Boolean),
    }));
  } catch (error) {
    console.error(`Error fetching Lever jobs for ${companyName}:`, error);
    return [];
  }
}