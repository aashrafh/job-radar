# Job Radar 🎯

Automated job search tool for senior frontend/full-stack roles with visa sponsorship and relocation support.

## Overview

Job Radar automatically discovers and ranks senior-level developer roles in your target markets that offer visa sponsorship or relocation support. It pulls from multiple job sources, uses AI to score jobs against your profile, and delivers a ranked list of the best matches.

## Features

- **Multi-source job aggregation**: Pulls from RemoteOK, Arbeitnow, Jobicy, Adzuna, and direct ATS feeds (Greenhouse, Lever, Ashby)
- **AI-powered scoring**: Uses Z.AI's GLM models to evaluate job fit based on your skills, experience, and preferences
- **Smart filtering**: Automatically excludes junior roles and focuses on relevant positions
- **Deduplication**: Tracks seen jobs to avoid showing the same listings repeatedly
- **Visa sponsorship detection**: Flags jobs that mention sponsorship or relocation support
- **Markdown reports**: Generates clean, readable reports with actionable results

## Architecture

The system is organized into tiers based on automation difficulty:

### Tier 1 - Public APIs (Fully Automated)
- **RemoteOK**: Global remote jobs
- **Arbeitnow**: EU-focused with dedicated relocation filter
- **Jobicy**: Global remote jobs
- **Adzuna**: Country-specific boards for UK, AU, NZ, DE, NL, and more (requires API key)

### Tier 2 - ATS Direct Feeds (Fully Automated)
Curated list of 15+ companies known to hire internationally, polled directly via their ATS:
- **Greenhouse**: Booking.com, Zalando, Revolut, Wise, Canva, etc.
- **Lever**: N26, Monzo, etc.
- **Ashby**: Additional companies

### Tier 3 - Specialized Boards (Manual Check Required)
These sources have excellent targeting but no public APIs - check them manually:
- **Relocate.me**: Tech-relocation job board
- **Landing.jobs**: Portugal-focused with visa filter
- **SEEK**: Dominates AU/NZ markets
- **Wellfound**: Has visa sponsorship filter
- **The Global Move**: Weekly curated list (paid)

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd job-radar

# Install dependencies
npm install

# Copy environment variables template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## Configuration

Edit `.env` file with your settings:

### Required
```env
ZAI_API_KEY=your_zai_api_key
```

### Optional (Adzuna)
```env
ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_APP_KEY=your_adzuna_app_key
```

### Search Criteria
```env
TARGET_COUNTRIES=UK,Germany,Netherlands,Portugal,Australia,New Zealand,Ireland,Spain,Estonia,Lithuania,Canada
ROLE_KEYWORDS=senior,lead,staff,principal,frontend,full-stack,fullstack,react,vue,angular,typescript,javascript
EXCLUDE_KEYWORDS=junior,intern,entry,graduate,trainee
```

### User Profile (for scoring)
```env
USER_YEARS_EXPERIENCE=8
USER_PRIMARY_SKILLS=React,TypeScript,JavaScript,Node.js,GraphQL
USER_SECONDARY_SKILLS=Vue,Angular,Python,AWS,Docker,CI/CD
USER_TARGET_LEVELS=Senior,Staff,Principal,Lead
```

### Scoring Thresholds
```env
MIN_SCORE_THRESHOLD=60
MAX_JOBS_PER_RUN=50
```

## Getting API Keys

### Z.AI API (Required)
1. Visit [Z.AI](https://open.bigmodel.cn/)
2. Sign up and get your API key
3. The free tier includes GLM-4-Flash which is sufficient for this use case

### Adzuna API (Optional)
1. Visit [Adzuna Developer Portal](https://developer.adzuna.com/)
2. Sign up and create an app
3. Get your App ID and App Key
4. This adds country-specific coverage but isn't required

## Usage

```bash
# Development mode
npm run dev

# Build and run
npm run build
npm start
```

## Output

Results are saved as markdown files in the `results/` directory:

```
results/
├── job-results-2024-01-15-14-30-45.md
├── job-results-2024-01-22-09-15-20.md
└── ...
```

Each report includes:
- Summary statistics
- Ranked job matches with scores
- Visa sponsorship flags
- Direct application links
- Fit explanations

### Example Output

```markdown
# Job Search Results

**Generated:** Monday, January 15, 2024 at 2:30 PM

## Summary

- **Total jobs fetched:** 247
- **After filtering:** 89
- **After deduping:** 12
- **Jobs scored:** 50
- **Above threshold:** 8

## Top Matches (8 jobs)

### 🟢 Score: 92/100

**Senior Frontend Engineer**

- **Company:** Booking.com
- **Location:** Amsterdam, Netherlands 🏠
- **Source:** greenhouse-bookingcom
- 🌍 **Visa Sponsorship Mentioned**
- **Reason:** Perfect skill match with React and TypeScript, senior role in target country, explicitly mentions relocation support

[Apply Here](https://boards.greenhouse.io/bookingcom/jobs/12345)

**Tags:** Engineering, Frontend, Remote

---
```

## How It Works

1. **Fetch**: Aggregates jobs from all Tier 1 and Tier 2 sources
2. **Filter**: Removes junior roles and non-relevant positions
3. **Score**: Uses AI to evaluate each job against your profile
4. **Dedupe**: Skips jobs you've already seen
5. **Report**: Generates a ranked markdown file with top matches

## Adding More Tier 2 Companies

Edit `src/config.ts` to add more companies with ATS feeds:

```typescript
const DEFAULT_TIER2_COMPANIES: Tier2Company[] = [
  // Add your company here
  { 
    name: 'Company Name',
    ats: 'greenhouse', // or 'lever' or 'ashby'
    token: 'board-token-slug',
    countries: ['Germany'],
    url: 'https://company.com'
  },
];
```

To find a company's ATS token:
- **Greenhouse**: Check URL: `https://boards.greenhouse.io/{token}/jobs`
- **Lever**: Check URL: `https://jobs.lever.co/{slug}`
- **Ashby**: Check URL: `https://jobs.ashbyhq.com/{slug}`

## Scheduled Runs

Set up automated runs with cron (Linux/Mac) or Task Scheduler (Windows):

### Cron (Linux/Mac)
```bash
# Edit crontab
crontab -e

# Add this line to run every Monday at 9 AM
0 9 * * 1 cd /path/to/job-radar && npm start >> job-radar.log 2>&1
```

## Data Storage

- **`data/seen-jobs.json`**: Cache of previously seen jobs (to avoid duplicates)
- **`results/`**: Directory containing all generated markdown reports

## Troubleshooting

### No jobs found
- Lower `MIN_SCORE_THRESHOLD` in `.env`
- Expand `ROLE_KEYWORDS` to include more terms
- Add more target countries
- Check that your `ZAI_API_KEY` is valid

### API errors
- Verify Z.AI API key is correct
- Check internet connection
- Some sources may be temporarily unavailable

### TypeScript errors
- Run `npm install` to ensure all dependencies are installed
- Ensure you're using Node.js 18+ and TypeScript 5+

## Contributing

To add more job sources:

1. Create a new file in `src/sources/tier1/` or `src/sources/tier2/`
2. Fetch jobs and normalize them to the `JobListing` interface
3. Import and call the function in `src/index.ts`

## License

MIT

## Acknowledgments

- Tier 2 company list inspired by [AndrewStetsenko/tech-jobs-with-relocation](https://github.com/AndrewStetsenko/tech-jobs-with-relocation)
- Built with Z.AI's GLM models for job scoring

---

**Happy job hunting! 🚀**