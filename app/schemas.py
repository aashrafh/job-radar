"""Pydantic models for the Job Radar pipeline."""
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl


# ----- Source configuration (sources.json) -----
class RedditGroup(BaseModel):
    """A named group of subreddits to crawl for job posts."""

    name: str = Field(..., description="Label for this group")
    subreddits: list[str] = Field(default_factory=list)
    extra_terms: Optional[str] = Field(
        default=None,
        description="Extra search terms appended to subreddit queries (e.g. 'hiring')",
    )


class SearchKeywords(BaseModel):
    """Global search keyword modifiers loaded from sources.json."""

    must_include: list[str] = Field(
        default_factory=lambda: ["remote"],
        description="Terms that must appear in every search query.",
    )
    boost_terms: list[str] = Field(
        default_factory=list,
        description="High-value terms appended to queries to surface sponsorship/relocation roles.",
    )


class Filters(BaseModel):
    """Post-search and post-scrape filtering rules."""

    exclude_countries: list[str] = Field(
        default_factory=list,
        description="Country names/codes to exclude (e.g. ['US', 'United States']).",
    )
    max_age_days: int = Field(
        default=7,
        ge=1,
        le=90,
        description="Only include jobs posted within this many days.",
    )


class SourceConfig(BaseModel):
    """Top-level sources.json structure."""

    search_keywords: Optional[SearchKeywords] = Field(default=None)
    filters: Optional[Filters] = Field(default=None)
    regions: list[str] = Field(
        default_factory=list,
        description="Target regions (e.g. EU, UK, AU/NZ, Global)",
    )
    job_boards: list[str] = Field(default_factory=list)
    reddit_groups: list[RedditGroup] = Field(default_factory=list)


# ----- Stage 1: Resume profile -----
class ResumeProfile(BaseModel):
    """Structured profile extracted from the resume by GLM."""

    summary: str = Field(..., description="Short professional summary")
    years_experience: int = Field(default=0, ge=0)
    target_roles: list[str] = Field(default_factory=list)
    key_skills: list[str] = Field(default_factory=list)
    search_queries: list[str] = Field(
        default_factory=list,
        description="Web search queries tuned for remote roles",
    )


# ----- Stage 2: Job postings -----
class JobPosting(BaseModel):
    """A scraped + structured job posting."""

    title: str
    company: str = Field(default="Unknown")
    location: str = Field(default="Unknown")
    is_remote: bool = Field(default=False)
    work_arrangement: Optional[str] = Field(
        default=None,
        description="remote | hybrid | onsite (inferred from posting)",
    )
    visa_sponsorship: Optional[bool] = Field(
        default=None,
        description="True if the posting mentions visa sponsorship.",
    )
    relocation_offered: Optional[bool] = Field(
        default=None,
        description="True if the posting mentions relocation assistance/package.",
    )
    description: str = Field(default="")
    requirements: list[str] = Field(default_factory=list)
    salary: Optional[str] = Field(default=None)
    url: str = Field(default="")


# ----- Stage 3: Scoring -----
class JobScore(BaseModel):
    """GLM's assessment of a posting against the profile."""

    score: int = Field(..., ge=0, le=100)
    worth_applying: bool = Field(default=False)
    rationale: str = Field(default="")
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)


# ----- Stage 4: Final scored + cover-letter job -----
class ScoredJob(BaseModel):
    """A job posting enriched with its score."""

    posting: JobPosting
    score: JobScore


class FinalJob(BaseModel):
    """Final pipeline output: scored job + optional cover letter."""

    posting: JobPosting
    score: JobScore
    cover_letter: Optional[str] = Field(default=None)


# ----- Progress events (SSE) -----
class ProgressEvent(BaseModel):
    stage: str = Field(..., description="one of: resume|search|score|cover|done|error")
    message: str = Field(default="")
    progress: int = Field(default=0, ge=0, le=100)
    data: Optional[dict] = Field(default=None)