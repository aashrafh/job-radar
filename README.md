# Job Radar

A CLI that pulls listings from a few job-board APIs, filters them against your
role, and uses Z.AI's GLM models to score each new one for fit — including
whether it mentions visa sponsorship or relocation support.

No scraping, no browser automation. Just public/free APIs + one model call
per new listing.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and add your Z.AI API key — sign up at https://z.ai, then go to
your profile menu → API Keys → Create a new API key.

Adzuna is optional but recommended — it's the only source here with real
national job boards (UK, Australia, New Zealand, Germany, Netherlands)
rather than remote-only listings. Free signup: https://developer.adzuna.com

## Run it

```bash
npm run search
```

First run scores everything that matches your role keywords. Every run
after that only scores *new* listings — seen jobs are cached in
`data/seen-jobs.json` so you're not re-scoring (and re-paying for) the same
job twice.

Options:

```bash
npm run search -- --min-score=70   # only show jobs scoring 70+
npm run search -- --no-cache       # ignore the cache, re-score everything
```

Results print to the terminal and also get saved to
`results/jobs-YYYY-MM-DD.md`.

## Tuning it to fit you

Everything about *what counts as a good fit* lives in `src/config.ts`:

- `targetRoleKeywords` / `excludeKeywords` — the cheap pre-filter, before
  anything hits the Claude API
- `targetCountries`, `needsSponsorship` — context the model uses to judge fit
- `proofPoints` — your actual achievements, so the model scores against
  substance, not just keyword overlap
- `minScoreToShow` — raise this if you're getting too much noise

Edit these directly. No code changes needed for day-to-day tuning.

## Adding another source

Each source is one small file in `src/sources/` that returns
`JobListing[]`. Copy `arbeitnow.ts` as a template — implement the fetch,
map the response shape to the shared `JobListing` type, and wire it into
`fetchAll()` in `src/cli.ts`.

## Cost

The default model, GLM-4.7-Flash, is free on Z.AI's API — rate-limited, not
a trial credit, so this should cost nothing for normal daily use. If you
want sharper judgment on borderline cases, bump `ZAI_MODEL` in `.env` to
`glm-5.2` (their flagship, paid per-token) — you'll only be scoring
genuinely new listings each run, so the volume stays low either way.

## Automating it

This is a plain CLI, so the natural next step is cron:

```bash
# Run every morning at 8am
0 8 * * * cd /path/to/job-radar && npm run search >> logs/run.log 2>&1
```
