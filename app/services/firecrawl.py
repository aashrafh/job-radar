"""Thin async client for Firecrawl: web search + structured LLM extraction.

Docs: https://docs.firecrawl.dev/
- POST /v1/search  -> web search, returns list of results (title, url, snippet)
- POST /v1/scrape  -> scrape URL; with `extract` it returns structured JSON

Uses httpx directly. Returns Pydantic-validated JobPosting objects.
"""
from __future__ import annotations

import logging
from typing import Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas import RedditGroup

import httpx

from app.config import Settings
from app.schemas import JobPosting

logger = logging.getLogger(__name__)


class FirecrawlError(RuntimeError):
    """Raised for unrecoverable Firecrawl failures."""


# JSON schema sent to Firecrawl's LLM extractor for each posting page.
JOB_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {
            "type": "string",
            "description": "The job title as advertised, e.g. 'Senior Backend Engineer'.",
        },
        "company": {
            "type": "string",
            "description": "Hiring company name.",
        },
        "location": {
            "type": "string",
            "description": "Location string as posted (city/country or 'Remote').",
        },
        "is_remote": {
            "type": "boolean",
            "description": "True if the role is remote or fully distributed.",
        },
        "description": {
            "type": "string",
            "description": "A concise summary of the role and what it involves.",
        },
        "requirements": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Key required skills, qualifications, and responsibilities.",
        },
        "salary": {
            "type": "string",
            "description": "Salary/rate if mentioned, else empty string.",
        },
    },
    "required": [
        "title",
        "company",
        "location",
        "is_remote",
        "description",
        "requirements",
    ],
}


class FirecrawlClient:
    """Async Firecrawl client returning JobPosting objects."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._base = settings.firecrawl_base_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {settings.firecrawl_api_key}",
            "Content-Type": "application/json",
        }
        self._timeout = httpx.Timeout(45.0, connect=15.0)

    @property
    def offline(self) -> bool:
        return not bool(self.settings.firecrawl_api_key)

    async def search_urls(self, query: str, limit: int) -> list[dict[str, str]]:
        """Run a web search and return [{'title','url','description'}]."""
        return await self._search(query, limit)

    # ------------------------------------------------------------------
    # Job-board targeted search
    # ------------------------------------------------------------------
    async def search_job_boards(
        self,
        query: str,
        boards: list[str],
        limit_per_board: int = 3,
    ) -> list[dict[str, str]]:
        """Search for *query* restricted to each job board domain.

        Builds `query site:domain` searches and de-duplicates URLs.
        """
        all_results: list[dict[str, str]] = []
        seen: set[str] = set()
        for board in boards:
            domain = board.strip().lstrip("https://").lstrip("http://").rstrip("/")
            board_query = f"{query} site:{domain}"
            try:
                results = await self._search(board_query, limit_per_board)
            except FirecrawlError as exc:
                logger.warning("Board search failed for %s: %s", domain, exc)
                continue
            for r in results:
                if r["url"] not in seen:
                    seen.add(r["url"])
                    r["source"] = f"board:{domain}"
                    all_results.append(r)
        return all_results

    # ------------------------------------------------------------------
    # Reddit subreddit crawl
    # ------------------------------------------------------------------
    async def search_reddit(
        self,
        groups: "list[RedditGroup]",
        query: str,
        limit_per_sub: int = 5,
    ) -> list[dict[str, str]]:
        """Search Reddit subreddits for job postings.

        For each subreddit, builds a query like:
            `<query> hiring site:reddit.com/r/<subreddit>`

        If the group has `extra_terms`, those are appended to every query.
        De-duplicates URLs across all groups.
        """
        all_results: list[dict[str, str]] = []
        seen: set[str] = set()
        for group in groups:
            extra = group.extra_terms or ""
            for sub in group.subreddits:
                parts = [query]
                if extra:
                    parts.append(extra)
                parts.append(f"site:reddit.com/r/{sub.strip()}")
                sub_query = " ".join(parts)
                try:
                    results = await self._search(sub_query, limit_per_sub)
                except FirecrawlError as exc:
                    logger.warning(
                        "Reddit search failed for r/%s: %s", sub, exc
                    )
                    continue
                for r in results:
                    if r["url"] not in seen:
                        seen.add(r["url"])
                        r["source"] = f"reddit:r/{sub.strip()}"
                        r["group"] = group.name
                        all_results.append(r)
        return all_results

    # ------------------------------------------------------------------
    # Internal search helper
    # ------------------------------------------------------------------
    async def _search(self, query: str, limit: int) -> list[dict[str, str]]:
        """Internal: run a Firecrawl /v1/search request and return normalized results."""
        if self.offline:
            raise FirecrawlError(
                "FIRECRAWL_API_KEY is not set — cannot search the web. "
                "Add your key to .env (see .env.example)."
            )
        payload = {
            "query": query,
            "limit": limit,
            "lang": "en",
            "scrapeOptions": {"formats": []},  # we only need URLs from search
        }
        url = f"{self._base}/search"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, headers=self._headers, json=payload)
        except httpx.RequestError as exc:
            raise FirecrawlError(f"Network error contacting Firecrawl: {exc}") from exc
        if resp.status_code >= 400:
            raise FirecrawlError(
                f"Firecrawl search error {resp.status_code}: {resp.text[:500]}"
            )
        data = resp.json().get("data", []) or []
        results: list[dict[str, str]] = []
        for item in data:
            link = item.get("url") or item.get("link")
            if not link:
                continue
            results.append(
                {
                    "title": item.get("title", ""),
                    "url": link,
                    "description": item.get("description") or item.get("snippet", ""),
                }
            )
        return results

    async def scrape_job(self, target_url: str) -> Optional[JobPosting]:
        """Scrape a posting URL and extract structured fields via LLM."""
        if self.offline:
            raise FirecrawlError("FIRECRAWL_API_KEY is not set.")
        payload = {
            "url": target_url,
            "formats": ["extract"],
            "extract": {
                "schema": JOB_SCHEMA,
                "systemPrompt": (
                    "You extract structured job-posting data from web pages. "
                    "If a field is not present, infer from context or use sensible "
                    "defaults (empty string / false). Always return valid JSON."
                ),
                "prompt": (
                    "Extract the job title, company, location, whether it is remote, "
                    "a concise description, key requirements, and salary (if any)."
                ),
            },
        }
        url = f"{self._base}/scrape"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, headers=self._headers, json=payload)
        except httpx.RequestError as exc:
            logger.warning("Firecrawl scrape network error for %s: %s", target_url, exc)
            return None
        if resp.status_code >= 400:
            logger.warning(
                "Firecrawl scrape error %d for %s: %s",
                resp.status_code,
                target_url,
                resp.text[:300],
            )
            return None
        body = resp.json().get("data") or {}
        extracted = body.get("extract") or body  # Firecrawl nests under .extract
        if not extracted or not isinstance(extracted, dict):
            logger.warning("No extract data for %s", target_url)
            return None
        try:
            posting = JobPosting.model_validate({**extracted, "url": target_url})
            return posting
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to validate posting for %s: %s", target_url, exc)
            return None