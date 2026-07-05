import fs from 'fs/promises';
import path from 'path';
import { SeenJobsCache, ScoredJob, JobRunResult } from './types.js';

const CACHE_FILE = path.join(process.cwd(), 'data', 'seen-jobs.json');
const RESULTS_DIR = path.join(process.cwd(), 'results');

export async function loadSeenJobsCache(): Promise<SeenJobsCache> {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Cache doesn't exist yet, return empty object
    return {};
  }
}

export async function saveSeenJobsCache(cache: SeenJobsCache): Promise<void> {
  try {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('Error saving seen jobs cache:', error);
  }
}

export async function dedupeJobs(jobs: ScoredJob[]): Promise<ScoredJob[]> {
  const cache = await loadSeenJobsCache();
  const now = Date.now();
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // Clean up old entries from cache (older than 1 week)
  for (const [id, entry] of Object.entries(cache)) {
    if (now - entry.timestamp > ONE_WEEK_MS) {
      delete cache[id];
    }
  }

  const newJobs = jobs.filter(job => {
    const existing = cache[job.id];
    if (!existing) {
      return true;
    }
    // Only re-score if the previous score was low or old
    if (existing.score < 50 || now - existing.timestamp > ONE_WEEK_MS) {
      return true;
    }
    return false;
  });

  console.log(`Deduped ${jobs.length} jobs down to ${newJobs.length} new/updated jobs`);
  return newJobs;
}

export async function markJobsAsSeen(jobs: ScoredJob[]): Promise<void> {
  const cache = await loadSeenJobsCache();
  const now = Date.now();

  for (const job of jobs) {
    cache[job.id] = {
      timestamp: now,
      score: job.fitScore,
    };
  }

  await saveSeenJobsCache(cache);
}

export async function saveResults(result: JobRunResult): Promise<string> {
  try {
    // Ensure results directory exists
    await fs.mkdir(RESULTS_DIR, { recursive: true });

    const dateStr = result.runDate.toISOString().split('T')[0];
    const timeStr = result.runDate.toTimeString().split(' ')[0].replace(/:/g, '-');
    const filename = `job-results-${dateStr}-${timeStr}.md`;
    const filepath = path.join(RESULTS_DIR, filename);

    const markdown = generateMarkdownReport(result);
    await fs.writeFile(filepath, markdown);

    console.log(`Results saved to ${filepath}`);
    return filepath;
  } catch (error) {
    console.error('Error saving results:', error);
    throw error;
  }
}

function generateMarkdownReport(result: JobRunResult): string {
  const dateStr = result.runDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  let markdown = `# Job Search Results\n\n`;
  markdown += `**Generated:** ${dateStr}\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `- **Total jobs fetched:** ${result.totalFetched}\n`;
  markdown += `- **After filtering:** ${result.afterFiltering}\n`;
  markdown += `- **After deduping:** ${result.afterDeduping}\n`;
  markdown += `- **Jobs scored:** ${result.scored}\n`;
  markdown += `- **Above threshold:** ${result.aboveThreshold}\n\n`;

  if (result.aboveThreshold === 0) {
    markdown += `## No jobs met the minimum score threshold.\n\n`;
    markdown += `Consider lowering the threshold or adjusting your search criteria.\n`;
    return markdown;
  }

  markdown += `## Top Matches (${result.aboveThreshold} jobs)\n\n`;

  for (const job of result.jobs) {
    const visaBadge = job.visaSignal ? '🌍 **Visa Sponsorship Mentioned**' : '';
    const scoreColor = job.fitScore >= 80 ? '🟢' : job.fitScore >= 60 ? '🟡' : '🔴';
    
    markdown += `### ${scoreColor} Score: ${job.fitScore}/100\n\n`;
    markdown += `**${job.title}**\n\n`;
    markdown += `- **Company:** ${job.company}\n`;
    markdown += `- **Location:** ${job.location} ${job.remote ? '🏠' : ''}\n`;
    markdown += `- **Source:** ${job.source}\n`;
    if (job.salary) {
      markdown += `- **Salary:** ${job.salary}\n`;
    }
    if (visaBadge) {
      markdown += `- ${visaBadge}\n`;
    }
    markdown += `- **Reason:** ${job.reason}\n\n`;
    markdown += `[Apply Here](${job.url})\n\n`;

    if (job.tags.length > 0) {
      markdown += `**Tags:** ${job.tags.join(', ')}\n\n`;
    }

    markdown += `---\n\n`;
  }

  markdown += `## Methodology\n\n`;
  markdown += `Jobs are scored based on:\n`;
  markdown += `1. **Skills match** - Alignment with your primary and secondary skills\n`;
  markdown += `2. **Experience level** - Fit with your ${result.jobs[0]?.title || 'experience level'}\n`;
  markdown += `3. **Role seniority** - Match with target levels (Senior, Staff, Principal, Lead)\n`;
  markdown += `4. **Location** - Preference for target countries\n`;
  markdown += `5. **Visa sponsorship** - Jobs mentioning sponsorship/relocation are flagged\n\n`;

  markdown += `## Next Steps\n\n`;
  markdown += `1. Review the top matches and prepare tailored applications\n`;
  markdown += `2. Check Tier 3 sources manually: Relocate.me, Landing.jobs, SEEK\n`;
  markdown += `3. Update your profile and filters in \`.env\` as needed\n`;
  markdown += `4. Run this script regularly (suggested: weekly)\n\n`;

  return markdown;
}