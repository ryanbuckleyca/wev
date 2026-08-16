#!/bin/bash
# Retry failed organization assessments against production database
set -e
cd "$(dirname "$0")" || exit

if [[ ! -r "../.env.production" ]]; then
	echo "⚠️  No readable .env.production found"
	exit 1
fi

set -a
# shellcheck disable=SC1091
source ../.env.production || exit 1
set +a
echo "yes" | .venv/bin/python retry_failed_orgs.py
