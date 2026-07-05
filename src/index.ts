import { loadConfig } from "./config.js";
import { fetchRemoteOKJobs } from "./sources/tier1/remoteok.js";
import {
  fetchArbeitnowJobs,
  fetchArbeitnowRelocationJobs,
} from "./sources/tier1/arbeitnow.js";
import { fetchJobicyJobs } from "./sources/tier1/jobicy.js";
import { fetchGreenhouseJobs } from "./sources/tier2/greenhouse.js";
import { fetchLeverJobs } from "./sources/tier2/lever.js";
import { fetchAshbyJobs } from "./sources/tier2/ashby.js";
import { filterJobs } from "./filtering.js";
import { scoreJobs } from "./scoring.js";
import { dedupeJobs, markJobsAsSeen, saveResults } from "./storage.js";
import { JobListing, JobRunResult, ScoredJob } from "./types.js";

async function fetchAllJobs(): Promise<JobListing[]> {
  const allJobs: JobListing[] = [];

  console.log("=== Fetching jobs from all sources ===\n");

  // Tier 1 Sources
  console.log("Fetching from Tier 1 sources...");

  console.log("  - RemoteOK...");
  const remoteokJobs = await fetchRemoteOKJobs();
  allJobs.push(...remoteokJobs);
  console.log(`    Found ${remoteokJobs.length} jobs`);

  console.log("  - Arbeitnow...");
  const arbeitnowJobs = await fetchArbeitnowJobs();
  allJobs.push(...arbeitnowJobs);
  console.log(`    Found ${arbeitnowJobs.length} jobs`);

  console.log("  - Arbeitnow (relocation filter)...");
  const arbeitnowRelocationJobs = await fetchArbeitnowRelocationJobs();
  allJobs.push(...arbeitnowRelocationJobs);
  console.log(`    Found ${arbeitnowRelocationJobs.length} jobs`);

  console.log("  - Jobicy...");
  const jobicyJobs = await fetchJobicyJobs();
  allJobs.push(...jobicyJobs);
  console.log(`    Found ${jobicyJobs.length} jobs`);

  // Tier 2 Sources (ATS feeds)
  const config = loadConfig();
  console.log("\nFetching from Tier 2 sources (ATS feeds)...");

  for (const company of config.tier2Companies) {
    console.log(`  - ${company.name} (${company.ats})...`);
    let companyJobs: JobListing[] = [];

    switch (company.ats) {
      case "greenhouse":
        companyJobs = await fetchGreenhouseJobs(company.token, company.name);
        break;
      case "lever":
        companyJobs = await fetchLeverJobs(company.token, company.name);
        break;
      case "ashby":
        companyJobs = await fetchAshbyJobs(company.token, company.name);
        break;
    }

    // Filter by company's target countries
    const filteredCompanyJobs = companyJobs.filter((job) => {
      const locationLower = job.location.toLowerCase();
      return (
        company.countries.some(
          (country) =>
            locationLower.includes(country.toLowerCase()) ||
            locationLower.includes(country.toLowerCase().replace(/\s+/g, "")),
        ) || job.remote
      );
    });

    allJobs.push(...filteredCompanyJobs);
    console.log(
      `    Found ${companyJobs.length} jobs, ${filteredCompanyJobs.length} match target countries`,
    );
  }

  console.log(`\nTotal jobs fetched: ${allJobs.length}\n`);
  return allJobs;
}

async function runJobSearch(): Promise<void> {
  console.log("🎯 Job Search Automation Started\n");
  console.log("=".repeat(50));

  const config = loadConfig();
  const startTime = Date.now();

  try {
    // Step 1: Fetch all jobs
    const allJobs = await fetchAllJobs();
    const totalFetched = allJobs.length;

    // Step 2: Filter jobs
    const filteredJobs = filterJobs(allJobs, config);
    const afterFiltering = filteredJobs.length;

    // Step 3: Score jobs
    console.log("Scoring jobs...");
    let scoredJobs: ScoredJob[];
    try {
      scoredJobs = await scoreJobs(filteredJobs, config, (current, total) => {
        if (current % 5 === 0 || current === total) {
          console.log(
            `  Progress: ${current}/${total} (${Math.round((current / total) * 100)}%)`,
          );
        }
      });
      const scores = scoredJobs.map((j) => j.fitScore);
      console.log(
        `  Scoring complete. Best: ${Math.max(...scores)}, Worst: ${Math.min(...scores)}`,
      );
    } catch (error: any) {
      console.error(
        `  Scoring failed: ${error.message}. Jobs will be saved with default scores.`,
      );
      // Create scored jobs with default values
      scoredJobs = filteredJobs.map((job) => ({
        ...job,
        fitScore: 50,
        visaSignal: false,
        reason: "Scoring service unavailable",
      }));
    }
    const scored = scoredJobs.length;

    // Step 4: Filter by threshold
    const aboveThreshold = scoredJobs.filter(
      (job) => job.fitScore >= config.scoring.minScoreThreshold,
    );
    const aboveThresholdCount = aboveThreshold.length;

    // Step 5: Dedupe against seen jobs
    const newJobs = await dedupeJobs(aboveThreshold);
    const afterDeduping = newJobs.length;

    // Step 6: Mark jobs as seen
    await markJobsAsSeen(newJobs);

    // Step 7: Generate and save results
    const result: JobRunResult = {
      totalFetched,
      afterFiltering,
      afterDeduping,
      scored,
      aboveThreshold: aboveThresholdCount,
      jobs: newJobs,
      runDate: new Date(),
    };

    const resultsPath = await saveResults(result);

    // Summary
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log("\n" + "=".repeat(50));
    console.log("📊 Run Summary");
    console.log("=".repeat(50));
    console.log(`Duration: ${duration}s`);
    console.log(`Jobs fetched: ${totalFetched}`);
    console.log(`After filtering: ${afterFiltering}`);
    console.log(`Jobs scored: ${scored}`);
    console.log(`Above threshold: ${aboveThresholdCount}`);
    console.log(`New matches: ${afterDeduping}`);
    console.log(`\nResults saved to: ${resultsPath}`);

    if (afterDeduping > 0) {
      console.log(`\n🎉 Found ${afterDeduping} new job match(es)!`);
    } else {
      console.log(`\n😔 No new matches found this run.`);
      console.log(`   Try adjusting your search criteria or check back later.`);
    }

    console.log("\n💡 Don't forget to check Tier 3 sources manually:");
    console.log("   - Relocate.me");
    console.log("   - Landing.jobs (Portugal)");
    console.log("   - SEEK (Australia/New Zealand)");
    console.log("   - The Global Move (Substack)\n");
  } catch (error) {
    console.error("\n❌ Error during job search:", error);
    process.exit(1);
  }
}

// Run the job search
runJobSearch();
