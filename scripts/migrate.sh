#!/usr/bin/env bash

set -euo pipefail

TARGET="${1:-}"
DRY_RUN="${MIGRATE_DRY_RUN:-0}"

if [[ -z "${TARGET}" ]]; then
  echo "Usage: scripts/migrate.sh <prod>"
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ Supabase CLI is not installed or not on PATH."
  exit 1
fi

# Always run from repo root so relative Supabase paths resolve consistently.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

run_push() {
  local args=(db push --linked --yes)

  if [[ "${DRY_RUN}" == "1" ]]; then
    args+=(--dry-run)
  fi

  if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
    args+=(-p "${SUPABASE_DB_PASSWORD}")
  fi

  supabase "${args[@]}"
}

case "${TARGET}" in
  prod)
    echo "▶ Running Supabase migration push to linked project (prod)..."
    run_push
    echo "✓ Supabase migration push completed."
    ;;
  *)
    echo "✗ Unsupported target: ${TARGET}"
    echo "  Supported targets: prod"
    exit 1
    ;;
esac
