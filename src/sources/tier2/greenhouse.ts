import axios from 'axios';
import { JobListing, GreenhouseJob } from '../../types.js';

export async function fetchGreenhouseJobs(companyToken: string, companyName: string): Promise<JobListing[]> {
  try {
    const response = await axios.get<GreenhouseJob[]>(
      `https://api.greenhouse.io/v1/boards/${companyToken}/jobs?content=true`
    );
    
    return response.data.map((job: GreenhouseJob) => ({
      id: `greenhouse-${companyToken}-${job.id}`,
      source: `greenhouse-${companyToken}`,
      title: job.title,
      company: companyName,
      location: job.location.name,
      remote: job.location.name.toLowerCase().includes('remote') || 
              job.location.name.toLowerCase().includes('anywhere'),
      url: job.absolute_url,
      description: job.content || '',
      tags: job.departments?.map(d => d.name) || [],
    }));
  } catch (error) {
    console.error(`Error fetching Greenhouse jobs for ${companyName}:`, error);
    return [];
  }
}