#!/usr/bin/env bash
# Resume skills pipeline against prod:
#   1) Re-extract skills_raw for jobs with <10 phrases (Gemini/Groq)
#   2) Retag all jobs that have skills_raw via local Jina (--publish)
#
# Usage (from wev-scraper):
#   CONFIRM_PROD_RUN=YES bash scripts/resume_skills_pipeline.sh
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source ../.venv/bin/activate
export PYTHONUNBUFFERED=1
export CONFIRM_PROD_RUN="${CONFIRM_PROD_RUN:-YES}"
# Prefer Gemini primary → flash-lite → Groq; abort only when all three hit daily 429.
export UNIFIED_SKIP_GROQ="${UNIFIED_SKIP_GROQ:-0}"
# Top Flash first, then lite fallback (override via env if needed).
export GEMINI_SSE_PRIMARY_MODEL="${GEMINI_SSE_PRIMARY_MODEL:-gemini-3.6-flash}"
export GEMINI_SSE_LITE_MODEL="${GEMINI_SSE_LITE_MODEL:-gemini-3.5-flash-lite}"

LOG_DIR="${LOG_DIR:-/tmp/wev-skills}"
mkdir -p "$LOG_DIR"

echo "=============================================="
echo "Step 1/2: LLM skills_raw extraction (force re-extract)"
echo "  UNIFIED_SKIP_GROQ=$UNIFIED_SKIP_GROQ"
echo "  PRIMARY=$GEMINI_SSE_PRIMARY_MODEL LITE=$GEMINI_SSE_LITE_MODEL"
echo "=============================================="
python -m scripts.unified_post_processor \
  --task skills \
  --prod \
  --force-reextract-skills \
  --page-limit 200 \
  2>&1 | tee "$LOG_DIR/extract_bulk.log"

echo "=============================================="
echo "Step 2/2: Local Jina ESCO retag (replace job_skills)"
echo "=============================================="
python -m scripts.tag_esco_skills_vector \
  --publish \
  --retag \
  --backfill \
  --workers "${TAG_ESCO_WORKERS:-4}" \
  2>&1 | tee "$LOG_DIR/retag_bulk.log"

echo "=============================================="
echo "Pipeline complete. Logs in $LOG_DIR"
echo "=============================================="
