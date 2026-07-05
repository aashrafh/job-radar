import axios from 'axios';
import { JobListing } from '../../types.js';

interface RemoteOKJob {
  id: number;
  slug: string;
  company: string;
  position: string;
  tags: string[];
  location: string;
  remote: boolean;
  url: string;
  description: string;
  apply_url: string;
  created_at: string;
}

export async function fetchRemoteOKJobs(): Promise<JobListing[]> {
  try {
    const response = await axios.get<RemoteOKJob[]>('https://remoteok.com/api');
    
    // Filter out non-job entries (first item is metadata)
    const jobs = response.data.filter(job => job.slug !== 'license');
    
    return jobs.map(job => ({
      id: `remoteok-${job.id}`,
      source: 'remoteok',
      title: job.position,
      company: job.company,
      location: job.location || 'Remote',
      remote: job.remote,
      url: job.url || job.apply_url,
      description: job.description || '',
      tags: job.tags || [],
      postedDate: new Date(job.created_at),
    }));
  } catch (error) {
    console.error('Error fetching RemoteOK jobs:', error);
    return [];
  }
}