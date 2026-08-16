#!/bin/bash
# Re-process incomplete organizations in production

set -e

cd "$(dirname "$0")"

# Load production environment
if [[ -f "../.env.production" ]]; then
	set -a
	# shellcheck disable=SC1091
	source ../.env.production || exit 1
	set +a
	echo "✓ Loaded production environment"
else
	echo "⚠️  No .env.production found"
	exit 1
fi

echo "Starting re-processing of incomplete organizations..."
echo ""

.venv/bin/python reprocess_incomplete_orgs.py

echo ""
echo "Re-processing complete!"
