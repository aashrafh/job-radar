"""Pydantic models for the Job Radar pipeline."""
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl


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