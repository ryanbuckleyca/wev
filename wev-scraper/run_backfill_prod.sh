#!/bin/bash
# Run organization backfill against production database
cd /Users/ry/code/wev/wev-scraper
export $(grep -v '^#' ../.env.production | xargs)
echo "yes" | venv/bin/python backfill_orgs.py
