#!/bin/bash
# run.sh — venv + deps (Python 3.12, requirements.txt or requirements-dev.txt, Playwright Chromium)

set -e

# Support running from root by changing to script's directory
cd "$(dirname "$0")"

# Use .python-version if you use pyenv so local matches prod (3.12)
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# Standard dependencies
echo "Installing/Updating dependencies..."
pip install --quiet -r requirements.txt

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
