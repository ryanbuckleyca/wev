#!/bin/bash
# Re-process incomplete organizations in production

set -e

cd "$(dirname "$0")"

# Load production environment
if [ -f "../.env.production" ]; then
    export $(grep -v '^#' ../.env.production | xargs)
    echo "✓ Loaded production environment"
else
    echo "⚠️  No .env.production found, using current environment"
fi

# Activate virtual environment
source venv/bin/activate

echo "Starting re-processing of incomplete organizations..."
echo ""

python reprocess_incomplete_orgs.py

echo ""
echo "Re-processing complete!"
