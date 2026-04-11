#!/bin/bash
# run.sh — venv + deps (Python 3.12, requirements.txt or requirements-dev.txt, Playwright Chromium)

set -e

# Use .python-version if you use pyenv so local matches prod (3.12)
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# Read ENV_MODE from .env using Python so quoted values and inline comments are handled correctly
if [ -f ".env" ]; then
    ENV_MODE=$(python3 -c "
import re
with open('.env') as f:
    for line in f:
        line = line.strip()
        if line.startswith('#') or '=' not in line:
            continue
        key, _, val = line.partition('=')
        if key.strip() == 'ENV_MODE':
            val = val.split('#')[0].strip().strip('\"').strip(\"'\")
            print(val)
            break
" 2>/dev/null)
fi

pip install --quiet --upgrade pip

if [ "$ENV_MODE" = "test" ]; then
    echo "Running in test mode. Installing dev dependencies..."
    pip install --quiet -r requirements-dev.txt
else
    echo "Running in production mode. Installing standard dependencies..."
    pip install --quiet -r requirements.txt
fi

# Ensure local package is installed in editable mode for root-relative imports
pip install --quiet -e .

# Match prod: ensure Chromium is installed (same as Dockerfile)
playwright install --with-deps chromium

if [ "$1" == "normalize" ] || [ "$1" == "--normalize" ] || [ "$1" == "-n" ]; then
    shift
    python3 -m utils.data_updater "$@"
elif [ "$1" == "municipality-backfill" ]; then
    shift
    python3 -m utils.backfill_municipality_canonical "$@"
else
    python3 scrape.py "$@"
fi
