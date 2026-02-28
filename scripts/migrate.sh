#!/usr/bin/env bash

set -euo pipefail

TARGET="${1:-}"
DRY_RUN="${MIGRATE_DRY_RUN:-0}"

if [[ -z "${TARGET}" ]]; then
  echo "Usage: scripts/migrate.sh <test|prod>"
  echo "  test - Apply migrations to test environment (wev-test)"
  echo "  prod - Apply migrations to production environment (wev-prod)"
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ Supabase CLI is not installed or not on PATH."
  exit 1
fi

# Always run from repo root so relative Supabase paths resolve consistently.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

# Load environment variables from .env
set -a
source .env
set +a

# Load environment-specific project reference
load_project_ref() {
  local env_file=".env.${TARGET}"
  
  # For production, load production overrides
  if [[ "${TARGET}" == "prod" && -f ".env.production" ]]; then
    set -a
    source ".env.production"
    set +a
  fi
  
  # Use environment variable if set, otherwise use default
  PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
  
  if [[ -z "${PROJECT_REF}" ]]; then
    echo "✗ SUPABASE_PROJECT_REF not set and no default for ${TARGET}"
    exit 1
  fi
  
  echo "✓ Using project reference: ${PROJECT_REF}"
}

# Link to target project and run migration
run_migration() {
  load_project_ref
  
  echo "▶ Linking to project: ${PROJECT_REF}"
  if ! supabase link --project-ref "${PROJECT_REF}"; then
    echo "✗ Failed to link to project ${PROJECT_REF}"
    exit 1
  fi
  
  echo "✓ Linked to ${TARGET} environment"
  
  local args=(db push --yes)

  if [[ "${DRY_RUN}" == "1" ]]; then
    args+=(--dry-run)
  fi

  if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
    args+=(-p "${SUPABASE_DB_PASSWORD}")
  fi

  echo "▶ Running: supabase ${args[*]}"
  supabase "${args[@]}"
}

case "${TARGET}" in
  test)
    echo "▶ Applying migrations to TEST environment..."
    run_migration
    echo "✓ Test environment migration completed."
    ;;
  prod)
    echo "▶ Applying migrations to PRODUCTION environment..."
    run_migration
    echo "✓ Production migration completed."
    ;;
  *)
    echo "✗ Unsupported target: ${TARGET}"
    echo "  Supported targets: test, prod"
    exit 1
    ;;
esac
