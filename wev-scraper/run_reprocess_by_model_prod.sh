#!/bin/bash
# Reprocess organizations by model tracking status

set -e

cd "$(dirname "$0")"

# Load production environment first
if [ -f "../.env.production" ]; then
    set -a
    source ../.env.production
    set +a
    echo "✓ Loaded production environment"
else
    echo "⚠️  No .env.production found"
    exit 1
fi

# Also load .env for keys like TAVILY_API_KEY
if [ -f "../.env" ]; then
    set -a
    source ../.env
    set +a
    echo "✓ Loaded .env for API keys"
fi

# Enable production database
export USE_PROD_DB=1

# Disable Groq in environment so it won't be used
export GROQ_API_KEY=""

# Activate virtual environment
source venv/bin/activate

echo ""
echo "Usage: $0 <mode> [--limit N]"
echo "Modes: groq, no_tracking"
echo ""

python reprocess_by_model.py "$@"
