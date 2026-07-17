"""Prompt loader and Jinja2 renderer for the prompts/ directory."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.config import get_settings

# Known prompt files (name without .md -> path under prompts/)
PROMPT_FILES = {
    "resume_analysis": "resume_analysis.md",
    "job_scoring": "job_scoring.md",
    "cover_letter": "cover_letter.md",
}


def _env_for(prompts_dir: Path) -> Environment:
    return Environment(
        loader=FileSystemLoader(str(prompts_dir)),
        autoescape=select_autoescape(default=False),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )


@lru_cache(maxsize=1)
def _jinja_env() -> Environment:
    settings = get_settings()
    return _env_for(settings.prompts_dir)


def render_prompt(name: str, **context: Any) -> str:
    """Render a named prompt template with the given context.

    `name` is a key in PROMPT_FILES (e.g. "resume_analysis"). Extra context
    variables are injected into the Jinja2 template. Raises FileNotFoundError
    if the prompt file is missing, and surfaces Jinja2 undefined errors loudly.
    """
    if name not in PROMPT_FILES:
        raise KeyError(f"Unknown prompt '{name}'. Known: {list(PROMPT_FILES)}")
    template_name = PROMPT_FILES[name]
    env = _jinja_env()
    try:
        template = env.get_template(template_name)
    except Exception as exc:  # noqa: BLE001 - re-raise with clearer message
        raise FileNotFoundError(
            f"Prompt template '{template_name}' not found in {get_settings().prompts_dir}"
        ) from exc
    return template.render(**context)