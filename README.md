# Job Radar

An AI job-application agent that reads your resume, searches the web for matching
remote roles, scores each posting against your profile, and drafts tailored
cover letters — all through a single-file web UI.

**Stack:** Python + FastAPI · Firecrawl (web search + structured scraping) ·
ZAI GLM 5.2 (resume analysis, job scoring, cover-letter writing) · Vanilla JS +
Tailwind (zero-build single-file UI).

---

## How it works (4-stage pipeline)

```
data/resume.md
      │
      ▼  1. resume   — GLM extracts target roles, key skills, search queries
      ▼  2. search   — Firecrawl searches the web + scrapes postings (JSON schema)
      ▼  3. score    — GLM scores each posting vs. your profile (0-100)
      ▼  4. cover    — GLM drafts a tailored cover letter for jobs worth applying
   results in the UI
```

- **Stage 1 — Resume analysis** (`prompts/resume_analysis.md`): GLM parses your
  resume into a structured `ResumeProfile` (summary, years, target roles, key
  skills, and 4-8 remote-tuned search queries).
- **Stage 2 — Job search** (`app/services/firecrawl.py`): each query is run
  through Firecrawl `/v1/search`; top URLs are scraped with `/v1/scrape` using an
  LLM extraction JSON schema → validated `JobPosting` objects.
- **Stage 3 — Scoring** (`prompts/job_scoring.md`): each posting is scored by GLM
  against your profile → `JobScore` (0-100, worth_applying, rationale,
  strengths, gaps).
- **Stage 4 — Cover letters** (`prompts/cover_letter.md`): for jobs scoring at or
  above `MIN_SCORE_TO_APPLY`, GLM drafts a tailored, resume-grounded cover letter.

---

## Project layout

```
job-radar/
├── app/
│   ├── main.py              # FastAPI app: routes + SSE progress streaming
│   ├── config.py            # pydantic-settings (env vars)
│   ├── schemas.py           # Pydantic models for every pipeline stage
│   ├── pipeline.py          # 4-stage orchestrator (async generator)
│   └── services/
│       ├── zai.py           # ZAI GLM client (OpenAI-compatible, JSON-validated)
│       ├── firecrawl.py     # Firecrawl search + structured-extract client
│       └── prompts.py       # Jinja2 loader/renderer for prompts/
├── prompts/
│   ├── resume_analysis.md
│   ├── job_scoring.md
│   └── cover_letter.md
├── static/index.html        # Single-file UI (Tailwind CDN + vanilla JS)
├── data/resume.md           # Your resume (editable in the UI)
├── requirements.txt
├── .env.example
└── README.md
```

---

## Quick start

### 1. Install

```bash
cd job-radar
python3 -m venv .venv && source .venv/bin/activate   # use python3 if `python` isn't on PATH
pip install -r requirements.txt
```

> Tip: you can skip this and just run `./run.sh` (below) — it creates the
> virtualenv and installs dependencies for you.

### 2. Add API keys

```bash
cp .env.example .env
# edit .env and set ZAI_API_KEY and FIRECRAWL_API_KEY
```

- **ZAI / Zhipu key**: https://open.bigmodel.cn/ — used for GLM (resume,
  scoring, cover letters). The endpoint is OpenAI-compatible.
- **Firecrawl key**: https://www.firecrawl.dev/ — used for web search and
  structured page extraction.

> Tip: set `ZAI_MODEL` to your provisioned GLM model id (e.g. `glm-5.2` if
> available). The default is `glm-4.5`.

### 3. Run

The recommended way is the bundled launcher (activates the venv, installs deps
if needed, and runs the server):

```bash
./run.sh
```

…or run uvicorn manually (make sure the venv is active):

```bash
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000.

> ⚠️ **Common gotcha:** the command is `uvicorn` (the Python ASGI server),
> **not** `unicorn` (a Ruby/Rack web server). They are completely unrelated.
> If you see errors like `rackup file (...) not readable` or
> `invalid option: --reload`, you accidentally typed `unicorn`.

### 4. Use it

1. Edit your resume in the left pane (Markdown) and click **Save**.
   A sample resume is provided at `data/resume.md`.
2. Click **Run Pipeline**. Progress streams live (SSE): resume → search → score
   → cover.
3. Review the results table (sorted by score). Click any row to see the
   rationale, strengths/gaps, and the generated cover letter (copy to clipboard).

---

## Configuration (`.env`)

| Var | Default | Purpose |
|---|---|---|
| `ZAI_API_KEY` | _(empty)_ | ZAI/Zhipu API key |
| `ZAI_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | OpenAI-compatible base URL |
| `ZAI_MODEL` | `glm-4.5` | GLM model id |
| `FIRECRAWL_API_KEY` | _(empty)_ | Firecrawl API key |
| `FIRECRAWL_BASE_URL` | `https://api.firecrawl.dev/v1` | Firecrawl API base |
| `MAX_JOBS_PER_QUERY` | `5` | URLs followed per search query |
| `MAX_JOBS_TO_SCORE` | `15` | Overall cap on scored postings |
| `MIN_SCORE_TO_APPLY` | `70` | Score threshold to draft a cover letter |
| `MAX_CONCURRENCY` | `4` | Parallel scrape/score/cover calls |

---

## API reference

| Method | Route | Description |
|---|---|---|
| `GET` | `/` | Single-file UI |
| `GET` | `/api/health` | Status + whether keys are configured |
| `GET` | `/api/resume` | Returns current resume markdown |
| `PUT` | `/api/resume` | Updates `data/resume.md` |
| `POST` | `/api/run` | Runs the pipeline as an **SSE** stream of `{stage, message, progress, data}` events |

SSE `data` payloads:
- `stage: resume` → `{ profile: {...} }`
- `stage: search` → `{ postings: [...] }`
- `stage: score` → `{ scored: [{ posting, score }] }`
- `stage: done` → `{ jobs: [{ posting, score, cover_letter }] }`
- `stage: error` → message only

---

## Customizing the AI

All AI behavior is driven by **prompt files** in `prompts/` — edit them to tune
tone, thresholds, or output shape. They are Jinja2 templates with access to:

- `resume_analysis.md`: `{{ resume }}`
- `job_scoring.md`: `{{ profile_json }}`, `{{ posting_json }}`
- `cover_letter.md`: `{{ resume }}`, `{{ profile_json }}`, `{{ posting_json }}`,
  `{{ score_json }}`

The scoring and resume prompts enforce strict JSON output validated against the
Pydantic models in `app/schemas.py`.

---

## Notes & limitations

- Requires both API keys to run live. Missing keys produce a clear error in the
  UI and server logs.
- Firecrawl structured extraction depends on the target page being scrapeable;
  login-walled or JS-heavy sites may return partial data (handled gracefully).
- GLM JSON outputs are validated and retried on parse failure, but occasional
  malformed outputs can still cause individual jobs to be skipped (logged as
  warnings, never fatal).
- The cover-letter step only runs for jobs scoring ≥ `MIN_SCORE_TO_APPLY`.