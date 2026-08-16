#!/bin/bash
# Run organization backfill against production database
set -e
cd /Users/ry/code/wev/wev-scraper || exit

if [[ ! -r "../.env.production" ]]; then
	echo "⚠️  No readable .env.production found"
	exit 1
fi

set -a
# shellcheck disable=SC1091
source ../.env.production || exit 1
set +a
echo "yes" | .venv/bin/python backfill_orgs.py
