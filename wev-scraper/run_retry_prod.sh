#!/bin/bash
# Retry failed organization assessments against production database
cd /Users/ry/code/wev/wev-scraper || exit
set -a
# shellcheck disable=SC1091
source ../.env.production
set +a
echo "yes" | venv/bin/python retry_failed_orgs.py
