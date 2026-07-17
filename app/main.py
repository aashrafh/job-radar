"""FastAPI app: pipeline orchestration, resume I/O, and SSE progress."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import PROJECT_ROOT, get_settings, load_sources
from app.pipeline import run_pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
logger = logging.getLogger("job-radar")

settings = get_settings()

app = FastAPI(title="Job Radar", version="0.1.0")


# ---------- models ----------
class ResumeIn(BaseModel):
    content: str


class SourcesIn(BaseModel):
    job_boards: list[str] = []
    reddit_groups: list[dict] = []


# ---------- helpers ----------
def _ensure_resume_file() -> None:
    """Create data/resume.md with the seed content if missing."""
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    if not settings.resume_path.exists():
        seed = (PROJECT_ROOT / "data" / "resume.md")
        # Fallback inline seed if the packaged sample is absent.
        settings.resume_path.write_text(
            seed.read_text(encoding="utf-8")
            if seed.exists()
            else "# My Resume\n\nDescribe your experience here.\n",
            encoding="utf-8",
        )


def _read_resume() -> str:
    _ensure_resume_file()
    return settings.resume_path.read_text(encoding="utf-8")


def _write_resume(content: str) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.resume_path.write_text(content, encoding="utf-8")


def _sse(payload: dict) -> str:
    """Format a dict as an SSE `data:` line."""
    return f"data: {json.dumps(payload)}\n\n"


# ---------- routes ----------
@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "configured": settings.is_configured,
        "zai_model": settings.zai_model,
        "min_score_to_apply": settings.min_score_to_apply,
    }


@app.get("/api/resume")
async def get_resume() -> dict:
    return {"content": _read_resume()}


@app.put("/api/resume")
async def update_resume(body: ResumeIn) -> dict:
    _write_resume(body.content)
    return {"status": "saved", "length": len(body.content)}


# ---------- sources config ----------
@app.get("/api/sources")
async def get_sources() -> dict:
    """Return the current sources.json content."""
    sources = load_sources()
    return sources.model_dump()


@app.put("/api/sources")
async def update_sources(body: SourcesIn) -> dict:
    """Update sources.json."""
    from app.schemas import SourceConfig

    config = SourceConfig.model_validate(body.model_dump())
    settings.sources_path.write_text(
        json.dumps(config.model_dump(), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return {
        "status": "saved",
        "job_boards": len(config.job_boards),
        "reddit_groups": len(config.reddit_groups),
    }


@app.post("/api/run")
async def run() -> StreamingResponse:
    """Run the full pipeline as an SSE stream of progress events."""
    resume_md = _read_resume()

    async def event_stream():
        try:
            async for evt in run_pipeline(resume_md):
                yield _sse(evt)
                if evt.get("stage") in ("done", "error"):
                    break
        except Exception as exc:  # noqa: BLE001 - last-resort guard for SSE
            logger.exception("Pipeline crashed")
            yield _sse(
                {
                    "stage": "error",
                    "message": f"Pipeline crashed: {exc}",
                    "progress": 0,
                }
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------- static UI ----------
# Mount static dir if it exists (for any auxiliary assets).
if settings.static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(settings.static_dir)), name="static")


@app.get("/")
async def index() -> FileResponse:
    index_path = settings.static_dir / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="static/index.html not found")
    return FileResponse(str(index_path))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)