import axios from 'axios';
import { JobListing } from '../../types.js';

interface JobicyJob {
  id?: string;
  url?: string;
  title?: string;
  company_name?: string;
  company_logo_url?: string;
  category?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
  tags?: string[];
}

export async function fetchJobicyJobs(): Promise<JobListing[]> {
  try {
    const response = await axios.get('https://jobicy.com/api/v2/remote-jobs');
    
    // Handle different response formats
    const jobs = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    
    return jobs.map((job: JobicyJob, index: number) => ({
      id: `jobicy-${job.id || `unknown-${index}`}`,
      source: 'jobicy',
      title: job.title || 'Unknown',
      company: job.company_name || 'Unknown',
      location: job.candidate_required_location || 'Remote',
      remote: true,
      url: job.url || '#',
      description: job.description || '',
      tags: Array.isArray(job.tags) ? job.tags : [],
      salary: job.salary || undefined,
      postedDate: job.publication_date ? new Date(job.publication_date) : undefined,
    }));
  } catch (error) {
    console.error('Error fetching Jobicy jobs:', error);
    return [];
  }
}