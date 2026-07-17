"""The 4-stage Job Radar pipeline orchestrator.

Stages:
  1. resume  — GLM extracts ResumeProfile from resume.md
  2. search  — Firecrawl searches + scrapes postings into JobPosting[]
  3. score   — GLM scores each posting against the profile -> JobScore[]
  4. cover   — GLM drafts cover letters for jobs worth applying to

`run_pipeline` is an async generator yielding ProgressEvent dicts suitable for
SSE streaming. It performs bounded concurrency for scraping and scoring.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator, Optional

from app.config import Settings, get_settings, load_sources
from app.schemas import (
    FinalJob,
    JobPosting,
    JobScore,
    ResumeProfile,
)
from app.services.firecrawl import FirecrawlClient
from app.services.prompts import render_prompt
from app.services.zai import ZAIClient, ZAIClientError

logger = logging.getLogger(__name__)


# ---- helpers ----
def _event(
    stage: str, message: str, progress: int, data: Optional[dict] = None
) -> dict[str, Any]:
    """Build a progress event dict (JSON-serializable)."""
    evt: dict[str, Any] = {"stage": stage, "message": message, "progress": progress}
    if data is not None:
        evt["data"] = data
    return evt


async def _gather_with_concurrency(
    n: int, *coros
) -> list[Any]:
    """Run coroutines with a bounded semaphore of size n; preserves order."""
    sem = asyncio.Semaphore(n)

    async def _guard(coro):
        async with sem:
            return await coro

    return await asyncio.gather(*(_guard(c) for c in coros), return_exceptions=True)


# ---- pipeline ----
async def run_pipeline(resume_md: str) -> AsyncIterator[dict[str, Any]]:
    """Run the full pipeline, yielding progress events as an async generator.

    Args:
        resume_md: full resume markdown text.

    Yields:
        dicts shaped like ProgressEvent (stage/message/progress/data).
    """
    settings: Settings = get_settings()

    # Fail fast with a clear message if keys are missing.
    if not settings.zai_api_key:
        yield _event(
            "error",
            "ZAI_API_KEY is not set. Add it to .env (see .env.example).",
            0,
        )
        return
    if not settings.firecrawl_api_key:
        yield _event(
            "error",
            "FIRECRAWL_API_KEY is not set. Add it to .env (see .env.example).",
            0,
        )
        return

    zai = ZAIClient(settings)
    firecrawl = FirecrawlClient(settings)

    # -------- Stage 1: Resume analysis --------
    yield _event("resume", "Analyzing resume with GLM…", 5)
    try:
        resume_prompt = render_prompt(
            "resume_analysis", resume=resume_md
        )
        profile = await zai.chat_json(resume_prompt, ResumeProfile)
    except (ZAIClientError, FileNotFoundError) as exc:
        yield _event("error", f"Resume analysis failed: {exc}", 5)
        return
    except Exception as exc:  # noqa: BLE001
        yield _event("error", f"Unexpected error during resume analysis: {exc}", 5)
        return

    if not profile.search_queries:
        # Derive fallback queries from target roles so search always runs.
        profile.search_queries = [
            f"{role} remote" for role in profile.target_roles or ["software engineer"]
        ]

    yield _event(
        "resume",
        f"Extracted {len(profile.target_roles)} target role(s), "
        f"{len(profile.key_skills)} skill(s), "
        f"{len(profile.search_queries)} search query/queries.",
        20,
        {"profile": profile.model_dump()},
    )

    # -------- Stage 2: Search + scrape --------
    yield _event("search", "Searching the web for remote roles…", 25)
    all_urls: list[dict[str, str]] = []
    seen: set[str] = set()
    per_query = settings.max_jobs_per_query

    # Load configured sources (job boards + reddit groups)
    sources = load_sources()

    for q in profile.search_queries:
        # (a) General web search
        try:
            results = await firecrawl.search_urls(q, limit=per_query)
        except Exception as exc:  # noqa: BLE001
            yield _event(
                "search", f"Search failed for '{q}': {exc}", 25
            )
            continue
        for r in results:
            if r["url"] not in seen:
                seen.add(r["url"])
                all_urls.append(r)

        # (b) Job-board targeted search
        if sources.job_boards:
            try:
                board_results = await firecrawl.search_job_boards(
                    q, sources.job_boards, limit_per_board=3
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Job board search failed for '%s': %s", q, exc)
            else:
                for r in board_results:
                    if r["url"] not in seen:
                        seen.add(r["url"])
                        all_urls.append(r)

        # (c) Reddit subreddit search
        if sources.reddit_groups:
            try:
                reddit_results = await firecrawl.search_reddit(
                    sources.reddit_groups, q, limit_per_sub=5
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Reddit search failed for '%s': %s", q, exc)
            else:
                for r in reddit_results:
                    if r["url"] not in seen:
                        seen.add(r["url"])
                        all_urls.append(r)

    # Cap the number of postings we will actually scrape + score.
    cap = settings.max_jobs_to_score
    target_urls = all_urls[:cap]
    yield _event(
        "search",
        f"Found {len(all_urls)} unique URLs; scraping up to {len(target_urls)}.",
        30,
    )

    postings: list[JobPosting] = []
    scrape_results = await _gather_with_concurrency(
        settings.max_concurrency,
        *(firecrawl.scrape_job(u["url"]) for u in target_urls),
    )
    for res in scrape_results:
        if isinstance(res, Exception):
            logger.warning("Scrape item failed: %s", res)
            continue
        if isinstance(res, JobPosting):
            postings.append(res)

    # De-duplicate by (title, company, url)
    deduped: dict[tuple[str, str, str], JobPosting] = {}
    for p in postings:
        key = (p.title.lower(), p.company.lower(), p.url)
        deduped.setdefault(key, p)
    postings = list(deduped.values())

    if not postings:
        yield _event(
            "done",
            "No job postings could be scraped from the search results.",
            100,
            {"jobs": []},
        )
        return

    yield _event(
        "search",
        f"Scraped {len(postings)} postings; scoring now.",
        45,
        {"postings": [p.model_dump() for p in postings]},
    )

    # -------- Stage 3: Score each posting --------
    yield _event("score", "Scoring postings against your profile…", 50)
    profile_brief = json.dumps(profile.model_dump(), indent=2)

    async def _score_one(posting: JobPosting) -> tuple[JobPosting, Optional[JobScore]]:
        prompt = render_prompt(
            "job_scoring",
            profile_json=profile_brief,
            posting_json=json.dumps(posting.model_dump(), indent=2),
        )
        try:
            score = await zai.chat_json(prompt, JobScore)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Scoring failed for '%s': %s", posting.title, exc)
            return posting, None
        return posting, score

    scored: list[tuple[JobPosting, JobScore]] = []
    score_results = await _gather_with_concurrency(
        settings.max_concurrency,
        *(_score_one(p) for p in postings),
    )
    for res in score_results:
        if isinstance(res, Exception) or res is None:
            continue
        posting, sc = res
        if sc is not None:
            scored.append((posting, sc))

    # Sort by score descending
    scored.sort(key=lambda x: x[1].score, reverse=True)
    yield _event(
        "score",
        f"Scored {len(scored)} postings.",
        75,
        {
            "scored": [
                {"posting": p.model_dump(), "score": s.model_dump()}
                for p, s in scored
            ]
        },
    )

    # -------- Stage 4: Cover letters --------
    # Apply threshold: also honour GLM's `worth_applying` flag if stricter.
    threshold = settings.min_score_to_apply
    worth = [(p, s) for p, s in scored if s.score >= threshold]

    yield _event(
        "cover",
        f"Drafting cover letters for {len(worth)} job(s) scoring >= {threshold}.",
        80,
    )

    async def _cover_one(
        posting: JobPosting, score: JobScore
    ) -> tuple[JobPosting, JobScore, Optional[str]]:
        prompt = render_prompt(
            "cover_letter",
            resume=resume_md,
            profile_json=profile_brief,
            posting_json=json.dumps(posting.model_dump(), indent=2),
            score_json=json.dumps(score.model_dump(), indent=2),
        )
        try:
            letter = await zai.chat_text(prompt)
            return posting, score, _clean_letter(letter)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Cover letter failed for '%s': %s", posting.title, exc)
            return posting, score, None

    cover_results = await _gather_with_concurrency(
        settings.max_concurrency,
        *(_cover_one(p, s) for p, s in worth),
    )

    # Build final list for ALL scored jobs (cover letter only if drafted).
    cover_map: dict[str, str] = {}
    for res in cover_results:
        if isinstance(res, Exception) or res is None:
            continue
        posting, _, letter = res
        if letter:
            cover_map[posting.url] = letter

    final_jobs: list[FinalJob] = [
        FinalJob(
            posting=p,
            score=s,
            cover_letter=cover_map.get(p.url),
        )
        for p, s in scored
    ]

    jobs_payload = [j.model_dump() for j in final_jobs]
    applied = sum(1 for j in final_jobs if j.cover_letter)
    yield _event(
        "done",
        f"Pipeline complete: {len(final_jobs)} job(s), {applied} cover letter(s).",
        100,
        {"jobs": jobs_payload},
    )


def _clean_letter(text: str) -> str:
    """Strip surrounding fences/quotes that GLM might wrap around prose."""
    t = text.strip()
    if t.startswith("```"):
        # remove first fence line
        first_nl = t.find("\n")
        if first_nl != -1:
            t = t[first_nl + 1 :]
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    return t.strip()