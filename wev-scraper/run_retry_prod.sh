#!/bin/bash
# Retry failed organization assessments against production database
cd /Users/ry/code/wev/wev-scraper
export $(grep -v '^#' ../.env.production | xargs)
echo "yes" | venv/bin/python retry_failed_orgs.py
