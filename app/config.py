"""Application configuration loaded from environment variables / .env."""
import logging
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.schemas import SourceConfig

# Project root: two levels up from this file (app/config.py -> project root)
PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- ZAI GLM ----
    zai_api_key: str = Field(default="", description="ZAI/Zhipu API key")
    zai_base_url: str = Field(
        default="https://open.bigmodel.cn/api/paas/v4",
        description="OpenAI-compatible base URL for ZAI/Zhipu",
    )
    zai_model: str = Field(default="glm-4.5", description="GLM model id")

    # ---- Firecrawl ----
    firecrawl_api_key: str = Field(default="", description="Firecrawl API key")
    firecrawl_base_url: str = Field(default="https://api.firecrawl.dev/v1")

    # ---- Pipeline tuning ----
    max_jobs_per_query: int = Field(default=5, ge=1, le=20)
    max_jobs_to_score: int = Field(default=15, ge=1, le=100)
    min_score_to_apply: int = Field(default=70, ge=0, le=100)
    max_concurrency: int = Field(default=4, ge=1, le=16)

    # ---- Paths ----
    prompts_dir: Path = Field(default=PROJECT_ROOT / "prompts")
    data_dir: Path = Field(default=PROJECT_ROOT / "data")
    resume_path: Path = Field(default=PROJECT_ROOT / "data" / "resume.md")
    static_dir: Path = Field(default=PROJECT_ROOT / "static")
    sources_path: Path = Field(default=PROJECT_ROOT / "sources.json")

    @property
    def is_configured(self) -> bool:
        """True if both API keys are present (i.e. live mode is possible)."""
        return bool(self.zai_api_key) and bool(self.firecrawl_api_key)


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor."""
    return Settings()


def load_sources(path: "Path | None" = None) -> SourceConfig:
    """Load and validate sources.json. Returns an empty SourceConfig if missing."""
    import json

    target = path or get_settings().sources_path
    if not target.exists():
        return SourceConfig(job_boards=[], reddit_groups=[])
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
        return SourceConfig.model_validate(data)
    except Exception as exc:  # noqa: BLE001
        logging.warning("Failed to load sources.json: %s", exc)
        return SourceConfig(job_boards=[], reddit_groups=[])