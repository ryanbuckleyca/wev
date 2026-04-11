#!/usr/bin/env bash

set -euo pipefail

TARGET="${1:-}"
DRY_RUN="${MIGRATE_DRY_RUN:-0}"

if [[ -z "${TARGET}" ]]; then
  echo "Usage: scripts/migrate.sh <local|staging|prod>"
  echo "  local   - Apply migrations and seed to local environment"
  echo "  staging - Apply migrations to staging environment"
  echo "  prod    - Apply migrations to production environment"
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ Supabase CLI is not installed or not on PATH."
  exit 1
fi

# Always run from repo root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

# Load environment variables
set -a
if [ -f .env ]; then source .env; fi
set +a

# Load environment-specific project reference
load_project_ref() {
  # For production, load production overrides
  if [[ "${TARGET}" == "prod" && -f ".env.production" ]]; then
    set -a
    source ".env.production"
    set +a
  fi

  # For staging, load staging overrides
  if [[ "${TARGET}" == "staging" && -f ".env.staging" ]]; then
    set -a
    source ".env.staging"
    set +a
  fi
  
  PROJECT_REF="${SUPABASE_PROJECT_REF:-}"

  if [[ -z "${PROJECT_REF}" && -n "${SUPABASE_URL:-}" ]]; then
    PROJECT_REF="$(printf '%s' "${SUPABASE_URL}" | sed -E 's#^[a-zA-Z]+://##' | cut -d'.' -f1)"
  fi
  
  if [[ -z "${PROJECT_REF}" ]]; then
    echo "✗ SUPABASE_PROJECT_REF not set for ${TARGET}, and it could not be derived from SUPABASE_URL"
    exit 1
  fi
  
  echo "✓ Using project reference: ${PROJECT_REF}"
}

# Run migration with auto-sync
run_migration() {
  load_project_ref
  
  echo "▶ Linking to project: ${PROJECT_REF}"
  supabase link --project-ref "${PROJECT_REF}"
  
  # AUTO-SYNC: Download missing remote migration files to your local migrations folder.
  # This prevents the "Remote migration versions not found" error by fetching them directly from the DB.
  echo "▶ Syncing migration history (fetching any missing files from remote)..."
  if ! supabase migration fetch --linked; then
    echo "ℹ️  No remote-only migrations found or fetch failed."
  fi
  
  local args=(db push --yes)

  if [[ "${DRY_RUN}" == "1" ]]; then
    args+=(--dry-run)
  fi

  if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
    args+=(-p "${SUPABASE_DB_PASSWORD}")
  fi

  echo "▶ Pushing local migrations..."
  if supabase "${args[@]}"; then
    echo "✅ Success!"
  else
    echo "❌ Push failed. If you see hash mismatches, you may need to 'git pull' first."
    exit 1
  fi

  if [[ "${DRY_RUN}" != "1" ]]; then
    echo "▶ Regenerating Supabase TypeScript types..."
    bash ./scripts/generate_supabase_types.sh
  fi
}

case "${TARGET}" in
  local)
    echo "▶ Resetting local database..."
    supabase db reset
    echo "▶ Seeding database with E2E dataset..."
    npx tsx scripts/seed-local.ts
    echo "▶ Regenerating TypeScript types..."
    bash ./scripts/generate_supabase_types.sh local
    echo "✨ Done."
    ;;
  staging|prod)
    echo "▶ Starting migration for ${TARGET}..."
    run_migration
    echo "✨ Done."
    ;;
  *)
    echo "✗ Unsupported target: ${TARGET}"
    exit 1
    ;;
esac
