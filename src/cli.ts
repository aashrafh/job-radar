import "dotenv/config";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { fetchRemoteOK } from "./sources/remoteok.js";
import { fetchArbeitnow } from "./sources/arbeitnow.js";
import { fetchJobicy } from "./sources/jobicy.js";
import { fetchAdzuna } from "./sources/adzuna.js";
import { loadSeen, saveSeen } from "./store.js";
import { scoreJobs } from "./scorer.js";
import { profile, searchConfig } from "./config.js";
import type { JobListing, ScoredJob } from "./types.js";

function matchesRole(job: JobListing): boolean {
  const text = `${job.title} ${job.tags.join(" ")}`.toLowerCase();
  if (profile.excludeKeywords.some((kw) => text.includes(kw))) return false;
  return profile.targetRoleKeywords.some((kw) => text.includes(kw));
}

function jobKey(job: JobListing): string {
  return `${job.source}:${job.id}`;
}

async function fetchAll(): Promise<JobListing[]> {
  const safely = async (label: string, fn: () => Promise<JobListing[]>) => {
    try {
      return await fn();
    } catch (err) {
      console.warn(`  ${label} failed: ${(err as Error).message}`);
      return [];
    }
  };

  const [remoteok, arbeitnow, jobicy, ...adzuna] = await Promise.all([
    safely("RemoteOK", fetchRemoteOK),
    safely("Arbeitnow", fetchArbeitnow),
    safely("Jobicy", fetchJobicy),
    ...searchConfig.queries.map((q) =>
      safely(`Adzuna (${q})`, () => fetchAdzuna(q)),
    ),
  ]);

  return [...remoteok, ...arbeitnow, ...jobicy, ...adzuna.flat()];
}

function printResults(results: ScoredJob[], minScore: number): void {
  if (results.length === 0) {
    console.log(`\nNothing cleared the ${minScore} score threshold this run.`);
    return;
  }
  console.log(`\n=== ${results.length} job(s) worth a look ===\n`);
  for (const job of results) {
    const visaTag = job.visaSignal === "mentioned" ? " [VISA MENTIONED]" : "";
    console.log(
      `${String(job.score).padStart(3)}  ${job.title} — ${job.company} (${job.location})${visaTag}`,
    );
    console.log(`     ${job.reason}`);
    console.log(`     ${job.url}\n`);
  }
}

async function saveResults(results: ScoredJob[]): Promise<string | null> {
  if (results.length === 0) return null;
  const dir = path.resolve("results");
  await mkdir(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `jobs-${date}.md`);

  const lines = [`# Job matches — ${date}\n`];
  for (const job of results) {
    lines.push(`## ${job.title} — ${job.company} (${job.score}/100)`);
    lines.push(`- Source: ${job.source}`);
    lines.push(`- Location: ${job.location}${job.remote ? " (remote)" : ""}`);
    lines.push(`- Visa signal: ${job.visaSignal}`);
    lines.push(`- Why: ${job.reason}`);
    lines.push(`- Link: ${job.url}`);
    lines.push("");
  }

  await writeFile(file, lines.join("\n"));
  return file;
}

async function main() {
  const args = process.argv.slice(2);
  const minScoreArg = args.find((a) => a.startsWith("--min-score="));
  const minScore = minScoreArg
    ? Number(minScoreArg.split("=")[1])
    : profile.minScoreToShow;
  const noCache = args.includes("--no-cache");

  if (!process.env.ZAI_API_KEY) {
    console.error(
      "ZAI_API_KEY is not set. Copy .env.example to .env and fill it in.",
    );
    process.exit(1);
  }

  console.log("Fetching listings from RemoteOK, Arbeitnow, Jobicy, Adzuna...");
  const allJobs = await fetchAll();
  console.log(`Fetched ${allJobs.length} raw listings.`);

  const roleFiltered = allJobs.filter(matchesRole);
  console.log(`${roleFiltered.length} match your role keywords.`);

  const seen = noCache ? new Set<string>() : await loadSeen();
  const fresh = roleFiltered.filter((j) => !seen.has(jobKey(j)));
  console.log(`${fresh.length} are new since your last run.`);

  if (fresh.length === 0) {
    console.log(
      "Nothing new to score. Run with --no-cache to re-scan everything from scratch.",
    );
    return;
  }

  console.log(
    `Scoring ${fresh.length} job(s) against your profile (this calls the Z.AI API)...`,
  );
  const scored = await scoreJobs(fresh);

  fresh.forEach((j) => seen.add(jobKey(j)));
  if (!noCache) await saveSeen(seen);

  const results = scored
    .filter((j) => j.score >= minScore)
    .sort((a, b) => b.score - a.score);

  printResults(results, minScore);
  const savedFile = await saveResults(results);
  if (savedFile) console.log(`Saved full results to ${savedFile}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
