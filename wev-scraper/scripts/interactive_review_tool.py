#!/usr/bin/env python3
"""Interactive CLI tool for reviewing and managing unprocessed jobs and organizations."""
import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

from dotenv import dotenv_values, load_dotenv

# --- Environment Setup ---
SCRIPT_DIR = Path(__file__).resolve().parent
SCRAPER_DIR = SCRIPT_DIR.parent if SCRIPT_DIR.name == "scripts" else SCRIPT_DIR
REPO_ROOT = SCRAPER_DIR.parent

sys.path.insert(0, str(SCRAPER_DIR))

from utils.prod_env import resolve_prod_env_path  # noqa: E402

# Explicitly discover and verify production credentials
prod_env_file = resolve_prod_env_path(Path(__file__))
has_prod_env = prod_env_file.exists()
explicit_prod_url = os.environ.get("SUPABASE_PROD_URL")

if has_prod_env:
    prod_values = dotenv_values(prod_env_file)
    explicit_prod_url = (
        prod_values.get("SUPABASE_PROD_URL")
        or prod_values.get("SUPABASE_URL")
        or explicit_prod_url
    )

if not explicit_prod_url:
    print(
        f"❌ Error: No explicit production credentials found.\n"
        f"Expected {prod_env_file} or SUPABASE_PROD_URL to define production database credentials.\n"
        f"Startup rejected to prevent accidental fallback to development credentials.",
        file=sys.stderr,
    )
    sys.exit(1)

# Load base .env first (for non-DB settings)
base_env_file = REPO_ROOT / ".env"
if base_env_file.exists():
    load_dotenv(base_env_file)

# Load prod env to override
if has_prod_env:
    load_dotenv(prod_env_file, override=True)

# Target PROD DB with confirmation bypass
os.environ["USE_PROD_DB"] = "1"
os.environ["PROD_CONFIRMED"] = "1"
os.environ["CONFIRM_PROD_RUN"] = "YES"
os.environ["ENV_MODE"] = "prod"

# --- Import Supabase and Catch-Up Utilities ---
from scripts.process_unprocessed import (  # noqa: E402
    process_unprocessed_jobs,
    process_unprocessed_orgs,
)
from settings import get_supabase_settings  # noqa: E402
from utils.catch_up import (  # noqa: E402
    find_unprocessed_jobs,
    find_unprocessed_organizations,
    job_catch_up_lines,
)
from utils.db import supabase  # noqa: E402
from utils.log import scraper_log as _log  # noqa: E402

config = get_supabase_settings()

# Verify that credentials selected by get_supabase_settings() match expected prod credentials
if config.url.rstrip("/") != explicit_prod_url.rstrip("/"):
    print(
        f"❌ Error: Active Supabase URL ({config.url}) does not match configured production URL ({explicit_prod_url}).\n"
        f"Refusing to proceed with production actions.",
        file=sys.stderr,
    )
    sys.exit(1)

if any(h in config.url for h in ("localhost", "127.0.0.1", "0.0.0.0")):
    print(
        f"❌ Error: Configured production URL points to a local instance ({config.url}). Aborting.",
        file=sys.stderr,
    )
    sys.exit(1)

_log(f"Connected to DB: {config.url}")


# --- Helper Functions ---
def display_jobs(jobs: List[Tuple[Dict[str, Any], List[str]]]):
    """Display a formatted table of unprocessed jobs and their missing processing steps."""
    if not jobs:
        print("No unprocessed jobs found.")
        return

    print("\n--- Unprocessed Jobs ---")
    for i, (job, reasons) in enumerate(jobs):
        job_id_short = str(job.get("id", "N/A"))[:8]
        title = (job.get("job_title") or "N/A")[:50]
        org = (job.get("organization") or "N/A")[:30]
        print(
            f"  [{i+1:3}] ID: {job_id_short} | Title: {title:<50} | Org: {org:<30} | Reasons: {', '.join(reasons)}"
        )
        print(f"      URL: {job.get('listing_url', 'N/A')}")


def display_reassessment_organizations(
    orgs: List[Tuple[Dict[str, Any], List[str]]], include_parked: bool = False
):
    """Display organizations currently queued for reassessment and their missing fields."""
    if not orgs:
        print("No organizations queued for reassessment.")
        return

    header = (
        "--- Organizations Queued for Reassessment (including parked) ---"
        if include_parked
        else "--- Organizations Queued for Reassessment ---"
    )
    print(f"\n{header}")
    for i, (org, reasons) in enumerate(orgs):
        org_id_short = str(org.get("id", "N/A"))[:8]
        name = (org.get("name") or "N/A")[:50]
        skip_reason = org.get("assessment_skip_reason") or "N/A"
        print(
            f"  [{i+1:3}] ID: {org_id_short} | Name: {name:<50} | Parked: {skip_reason:<15} | Missing: {', '.join(reasons)}"
        )


def display_parked_organizations(orgs: List[Tuple[Dict[str, Any], List[str]]]):
    """Display parked organizations with their skip reasons and missing attributes."""
    if not orgs:
        print("No parked organizations found.")
        return

    print("\n--- Parked Organizations (Available to Unpark) ---")
    for i, (org, reasons) in enumerate(orgs):
        org_id_short = str(org.get("id", "N/A"))[:8]
        name = (org.get("name") or "N/A")[:50]
        skip_reason = org.get("assessment_skip_reason") or "N/A"
        print(
            f"  [{i+1:3}] ID: {org_id_short} | Name: {name:<50} | Parked Reason: {skip_reason:<20} | Missing: {', '.join(reasons)}"
        )


def unpark_organization(org_id: str) -> bool:
    """Clear assessment_skip_reason in Supabase to restore the organization to active processing."""
    try:
        resp = (
            supabase.table("organizations")
            .update({"assessment_skip_reason": None})
            .eq("id", org_id)
            .execute()
        )
        if resp.data:
            _log(f"Successfully unparked organization {org_id}")
            return True
        else:
            _log(
                f"Failed to unpark organization {org_id}: No data returned. It might have been updated concurrently or doesn't exist."
            )
            return False
    except Exception as e:
        _log(f"Error unparking organization {org_id}: {e}")
        return False


def main():
    """Run the interactive review CLI loop for managing unprocessed jobs and organizations."""
    parser = argparse.ArgumentParser(
        description="Interactive CLI for managing unprocessed jobs and organizations."
    )
    parser.add_argument(
        "--include-parked",
        action="store_true",
        help="Include previously parked organizations for reassessment.",
    )
    args = parser.parse_args()

    while True:
        print("\n" + "=" * 80)
        print("Interactive Unprocessed Review Tool")
        print("=" * 80)

        unprocessed_jobs_raw = find_unprocessed_jobs()

        # Retrieve all incomplete orgs to isolate parked orgs for the unpark action
        all_incomplete_orgs = find_unprocessed_organizations(include_parked=True)
        parked_orgs = [
            item
            for item in all_incomplete_orgs
            if item[0].get("assessment_skip_reason") is not None
        ]

        # The reassessment list respects --include-parked without mutating parked_orgs
        reassessment_orgs = (
            all_incomplete_orgs
            if args.include_parked
            else [
                item
                for item in all_incomplete_orgs
                if item[0].get("assessment_skip_reason") is None
            ]
        )

        print(f"Found {len(unprocessed_jobs_raw)} unprocessed jobs.")
        print(
            f"Found {len(reassessment_orgs)} organizations queued for reassessment (including parked={args.include_parked})."
        )
        print(
            f"Found {len(parked_orgs)} parked organizations available to unpark."
        )

        display_jobs(unprocessed_jobs_raw)
        display_reassessment_organizations(
            reassessment_orgs, include_parked=args.include_parked
        )
        display_parked_organizations(parked_orgs)

        print("\n--- Actions ---")
        print("j: Re-process all unprocessed jobs")
        print("o: Re-assess all queued organizations")
        print("u [ORG_NUM]: Unpark a specific organization (by its number in Parked Organizations)")
        print("r: Refresh lists")
        print("q: Quit")

        choice = input("\nEnter your choice: ").strip().lower()

        if choice == "q":
            break
        elif choice == "r":
            continue
        elif choice == "j":
            if unprocessed_jobs_raw:
                _log("\n--- Re-processing Jobs ---")
                job_result = process_unprocessed_jobs(unprocessed_jobs_raw)
                original_ids = {job["id"] for job, _needs in unprocessed_jobs_raw}
                remaining = [
                    (job, needs)
                    for job, needs in find_unprocessed_jobs()
                    if job["id"] in original_ids
                ]
                for line in job_catch_up_lines(len(unprocessed_jobs_raw), job_result, remaining):
                    _log(line)
            else:
                print("No jobs to process.")
        elif choice == "o":
            if reassessment_orgs:
                _log("\n--- Re-assessing Organizations ---")
                ok, err = process_unprocessed_orgs(reassessment_orgs)
                _log(f"Organizations: {ok} completed, {err} errors.")
            else:
                print("No organizations to assess.")
        elif choice.startswith("u "):
            try:
                org_num = int(choice.split(" ")[1]) - 1
                if 0 <= org_num < len(parked_orgs):
                    selected_org_id = parked_orgs[org_num][0]["id"]
                    if unpark_organization(selected_org_id):
                        print(
                            f"Successfully unparked organization {selected_org_id}. Refreshing lists..."
                        )
                    else:
                        print(f"Could not unpark organization {selected_org_id}.")
                else:
                    print(
                        f"Invalid organization number. Please choose a number between 1 and {len(parked_orgs)}."
                    )
            except (ValueError, IndexError):
                print("Invalid command. Use 'u [ORG_NUM]'.")
        else:
            print("Invalid choice. Please try again.")


if __name__ == "__main__":
    main()
