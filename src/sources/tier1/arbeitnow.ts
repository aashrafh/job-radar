import axios from 'axios';
import { JobListing } from '../../types.js';

interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: string;
}

export async function fetchArbeitnowJobs(): Promise<JobListing[]> {
  try {
    const response = await axios.get('https://arbeitnow.com/api/job-board-api');
    
    // Handle different response formats
    const jobs = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    
    return jobs.map((job: ArbeitnowJob, index: number) => ({
      id: `arbeitnow-${job.slug || `unknown-${index}`}`,
      source: 'arbeitnow',
      title: job.title || 'Unknown',
      company: job.company_name || 'Unknown',
      location: job.location || 'Remote',
      remote: job.remote || false,
      url: job.url || '#',
      description: job.description || '',
      tags: Array.isArray(job.tags) ? job.tags : [],
      postedDate: job.created_at ? new Date(job.created_at) : undefined,
    }));
  } catch (error) {
    console.error('Error fetching Arbeitnow jobs:', error);
    return [];
  }
}

// Fetch jobs specifically from the relocation endpoint
export async function fetchArbeitnowRelocationJobs(): Promise<JobListing[]> {
  try {
    const response = await axios.get('https://arbeitnow.com/api/job-board-api?relocation=true');
    
    // Handle different response formats
    const jobs = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    
    return jobs.map((job: ArbeitnowJob, index: number) => ({
      id: `arbeitnow-relocation-${job.slug || `unknown-${index}`}`,
      source: 'arbeitnow',
      title: job.title || 'Unknown',
      company: job.company_name || 'Unknown',
      location: job.location || 'Remote',
      remote: job.remote || false,
      url: job.url || '#',
      description: job.description || '',
      tags: Array.isArray(job.tags) ? job.tags : [],
      postedDate: job.created_at ? new Date(job.created_at) : undefined,
    }));
  } catch (error) {
    console.error('Error fetching Arbeitnow relocation jobs:', error);
    return [];
  }
}