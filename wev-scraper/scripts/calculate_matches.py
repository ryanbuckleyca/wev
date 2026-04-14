#!/usr/bin/env python
"""Recalculate job_matches via Postgres (same functions as profile/job triggers).

Uses rpc('recalculate_matches_for_user') / rpc('recalculate_matches_for_job') so scores
match wev-bulletin/lib/match-calculator.ts and the PL/pgSQL in supabase/migrations/.
Requires migration 20260328120000_grant_recalculate_match_rpcs.sql applied (GRANT EXECUTE
to service_role).
"""

from __future__ import annotations

import argparse
import os
import sys

# When run as __main__, handle --prod before importing utils.db.
if __name__ == "__main__":
    if "--prod" in sys.argv[1:]:
        _confirm = os.environ.get("CONFIRM_PROD_RUN")
        if sys.stdin.isatty():
            print("\nWARNING: You are about to run against the PRODUCTION database.")
            print("This will modify real data.\n")
            _resp = input("Type YES to continue, anything else to abort: ")
            if _resp.strip() != "YES":
                print("Aborted.")
                sys.exit(1)
        elif _confirm != "YES":
            print(
                "Refusing to run against production in non-interactive mode. "
                "Set CONFIRM_PROD_RUN=YES to override."
            )
            sys.exit(1)
        os.environ["USE_PROD_DB"] = "1"
        print("🔥 Using PRODUCTION database")
    else:
        print("🧪 Using TEST database")

from utils.db import fetch_all_rows, supabase


def _rpc_recalculate_matches_for_user(user_id: str) -> None:
    supabase.rpc("recalculate_matches_for_user", {"p_user_id": user_id}).execute()


def _rpc_recalculate_matches_for_job(job_id: str) -> None:
    supabase.rpc("recalculate_matches_for_job", {"p_job_id": job_id}).execute()


def calculate_matches_for_user(user_id: str, limit: int | None = None) -> int:
    """Recalculate all job_matches for one user (all jobs)."""
    if limit is not None:
        print(
            "  Note: --limit is ignored with --user-id; the DB function recalculates against all jobs."
        )
    print(f"🎯 Recalculating matches for user {user_id} (Postgres RPC)...")
    try:
        _rpc_recalculate_matches_for_user(user_id)
    except Exception as e:
        print(f"  ✗ RPC failed: {e}")
        return 0
    print("  ✅ Done")
    return 1


def calculate_matches_for_job(job_id: str) -> int:
    """Recalculate all job_matches for one job (all profiles)."""
    print(f"🎯 Recalculating matches for job {job_id} (Postgres RPC)...")
    try:
        _rpc_recalculate_matches_for_job(job_id)
    except Exception as e:
        print(f"  ✗ RPC failed: {e}")
        return 0
    print("  ✅ Done")
    return 1


def calculate_all_matches(*, max_profiles: int | None = None) -> int:
    """Call recalculate_matches_for_user for every profile (cleanup + full refresh)."""
    print("🎯 Recalculating matches for all profiles (Postgres RPC per user)...")
    try:
        profiles = fetch_all_rows("profiles", "id")
    except Exception as e:
        print(f"Error fetching profiles: {e}")
        return 0

    if max_profiles is not None:
        profiles = profiles[:max_profiles]

    total = len(profiles)
    print(f"  Processing {total} profiles...")
    errors = 0
    for i, row in enumerate(profiles, 1):
        uid = row["id"]
        if i % 100 == 0 or i == 1:
            print(f"  … {i}/{total}")
        try:
            _rpc_recalculate_matches_for_user(uid)
        except Exception as e:
            errors += 1
            print(f"  ✗ user {uid}: {e}")

    print(f"✅ Finished ({total - errors} ok, {errors} errors)")
    return total - errors


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Recalculate job_matches via Postgres (same logic as DB triggers)."
    )
    parser.add_argument("--user-id", help="Recalculate matches for one user (all jobs)")
    parser.add_argument("--job-id", help="Recalculate matches for one job (all users)")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Recalculate for every profile (expensive; use --limit to cap count)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="With --all only: process at most this many profiles (order: id)",
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Use production database (confirmed at startup).",
    )

    args = parser.parse_args()

    if args.user_id:
        calculate_matches_for_user(args.user_id, args.limit)
    elif args.job_id:
        if args.limit is not None:
            print("Note: --limit is ignored with --job-id.")
        calculate_matches_for_job(args.job_id)
    elif args.all:
        calculate_all_matches(max_profiles=args.limit)
    else:
        print("Please specify --user-id, --job-id, or --all")
        parser.print_help()


if __name__ == "__main__":
    main()
