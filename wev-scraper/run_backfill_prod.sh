#!/bin/bash
# Run organization backfill against production database
cd /Users/ry/code/wev/wev-scraper || exit
set -a
# shellcheck disable=SC1091
source ../.env.production
set +a
echo "yes" | venv/bin/python backfill_orgs.py
