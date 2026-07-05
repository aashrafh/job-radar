import axios from 'axios';
import { JobListing, AshbyJob } from '../../types.js';

export async function fetchAshbyJobs(companySlug: string, companyName: string): Promise<JobListing[]> {
  try {
    const response = await axios.get<{ jobs: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${companySlug}`
    );
    
    if (!response.data.jobs) {
      return [];
    }
    
    return response.data.jobs.map((job: AshbyJob) => ({
      id: `ashby-${companySlug}-${job.jobId}`,
      source: `ashby-${companySlug}`,
      title: job.title,
      company: companyName,
      location: job.locationName,
      remote: job.locationName.toLowerCase().includes('remote') || 
              job.locationName.toLowerCase().includes('anywhere'),
      url: `https://jobs.ashbyhq.com/${companySlug}/${job.jobId}`,
      description: job.descriptionMarkdown || job.descriptionHtml,
      tags: [job.employmentType].filter(Boolean),
      salary: job.compensation?.formattedMinCompensation 
        ? `${job.compensation.formattedMinCompensation}${job.compensation.formattedMaxCompensation ? ' - ' + job.compensation.formattedMaxCompensation : ''}`
        : undefined,
    }));
  } catch (error) {
    console.error(`Error fetching Ashby jobs for ${companyName}:`, error);
    return [];
  }
}