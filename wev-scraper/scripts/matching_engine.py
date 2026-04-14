#!/usr/bin/env python
"""Event-driven matching hooks — delegate to Postgres (same as DB triggers).

Prefer database triggers on profiles/jobs for production. These helpers exist for
manual or webhook-style invocations using the service role.
"""

import os
import sys

# --prod must be checked before utils.db is imported so USE_PROD_DB is set
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

from utils.db import supabase


def _rpc_recalculate_matches_for_job(job_id: str) -> None:
    supabase.rpc("recalculate_matches_for_job", {"p_job_id": job_id}).execute()


def _rpc_recalculate_matches_for_user(user_id: str) -> None:
    supabase.rpc("recalculate_matches_for_user", {"p_user_id": user_id}).execute()


def on_job_tagged_or_updated(job_id: str) -> None:
    """Recalculate matches for this job against all profiles."""
    print(f"🎯 Job tagged/updated: {job_id}")
    try:
        _rpc_recalculate_matches_for_job(job_id)
    except Exception as e:
        print(f"  ✗ RPC failed: {e}")
        return
    print("  ✅ Recalculated (Postgres)")


def on_user_values_updated(user_id: str) -> None:
    """Recalculate matches for this user against all jobs."""
    print(f"👤 User values updated: {user_id}")
    try:
        _rpc_recalculate_matches_for_user(user_id)
    except Exception as e:
        print(f"  ✗ RPC failed: {e}")
        return
    print("  ✅ Recalculated (Postgres)")


def on_new_user_signup(user_id: str) -> None:
    """Recalculate matches if the profile may already have values (edge case)."""
    print(f"🆕 New user signup: {user_id}")
    on_user_values_updated(user_id)


def integrate_with_job_tagging() -> None:
    """Call this from your job tagging system."""
    pass


def integrate_with_profile_updates() -> None:
    """Call this from your profile update system."""
    pass


def integrate_with_auth_system() -> None:
    """Call this from your user signup system."""
    pass


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test matching RPC hooks")
    parser.add_argument("--job-id", help="Recalculate for one job")
    parser.add_argument("--user-id", help="Recalculate for one user")
    parser.add_argument("--prod", action="store_true", help="Use production database.")

    args = parser.parse_args()

    if args.job_id:
        on_job_tagged_or_updated(args.job_id)
    elif args.user_id:
        on_user_values_updated(args.user_id)
    else:
        print("Please specify --job-id or --user-id")
        parser.print_help()
