#!/usr/bin/env bash
# Job Radar launcher.
#
# The correct command is `uvicorn` (Python ASGI server), NOT `unicorn`
# (which is a Ruby web server). This script removes that footgun by activating
# the virtualenv and running uvicorn for you.
#
# Usage:
#   ./run.sh                 # default: host 127.0.0.1, port 8000, reload on
#   ./run.sh --port 9000     # override port
#   ./run.sh --no-reload     # disable auto-reload
set -euo pipefail

cd "$(dirname "$0")"

# Prefer python3 if `python` isn't on PATH (common on Debian/Ubuntu).
PYBIN="$(command -v python || command -v python3)"

# Create the virtualenv if it's missing.
if [ ! -d ".venv" ]; then
  echo "Creating virtualenv (.venv) with ${PYBIN} ..."
  "$PYBIN" -m venv .venv
fi

# Activate it.
# shellcheck disable=SC1091
source .venv/bin/activate

# Install dependencies if uvicorn isn't present.
if ! python -c "import uvicorn" >/dev/null 2>&1; then
  echo "Installing dependencies from requirements.txt ..."
  pip install -r requirements.txt
fi

# Warn (not fail) if API keys look unset, since the UI will surface it too.
if [ -f ".env" ]; then
  if grep -q "your_zai_api_key_here\|your_firecrawl_api_key_here" .env; then
    echo "⚠️  Heads up: .env still has placeholder API keys. Edit it before running the pipeline."
  fi
else
  echo "⚠️  No .env file found. Copy .env.example to .env and set your API keys."
fi

HOST="127.0.0.1"
PORT="8000"
RELOAD="--reload"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2;;
    --host) HOST="$2"; shift 2;;
    --no-reload) RELOAD=""; shift;;
    *) echo "Unknown option: $1"; exit 1;;
  esac
done

echo "Starting Job Radar on http://${HOST}:${PORT}"
exec uvicorn app.main:app --host "${HOST}" --port "${PORT}" ${RELOAD}