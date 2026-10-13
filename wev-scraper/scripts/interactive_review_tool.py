#!/usr/bin/env python3
"""Interactive CLI tool for reviewing and managing unprocessed jobs and organizations."""
import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

from dotenv import load_dotenv

# --- Environment Setup ---
SCRIPT_DIR = Path(__file__).resolve().parent
SCRAPER_DIR = SCRIPT_DIR.parent if SCRIPT_DIR.name == "scripts" else SCRIPT_DIR
REPO_ROOT = SCRAPER_DIR.parent

sys.path.insert(0, str(SCRAPER_DIR))

# Load dotenv files FIRST so they can't override mandatory prod settings
for env_file in [REPO_ROOT / ".env", REPO_ROOT / ".env.production"]:
    if env_file.exists():
        load_dotenv(env_file, override=True)

# Env setup: target PROD DB with confirmation bypass (set AFTER dotenv)
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
)
from utils.db import supabase  # noqa: E402
from utils.log import scraper_log as _log  # noqa: E402

config = get_supabase_settings()
_log(f"Connected to DB: {config.url}")

# --- Helper Functions ---
def display_jobs(jobs: List[Tuple[Dict[str, Any], List[str]]]):
    if not jobs:
        print("No unprocessed jobs found.")
        return

    print("\n--- Unprocessed Jobs ---")
    for i, (job, reasons) in enumerate(jobs):
        job_id_short = str(job['id'])[:8] if 'id' in job else 'N/A'
        title = job.get('job_title', 'N/A')
        org = job.get('organization', 'N/A')
        print(f"  [{i+1:3}] ID: {job_id_short} | Title: {title[:50]:<50} | Org: {org[:30]:<30} | Reasons: {', '.join(reasons)}")
        print(f"      URL: {job.get('listing_url', 'N/A')}")

def display_organizations(orgs: List[Tuple[Dict[str, Any], List[str]]]):
    if not orgs:
        print("No unprocessed organizations found.")
        return

    print("\n--- Parked Organizations ---")
    for i, (org, reasons) in enumerate(orgs):
        org_id_short = str(org['id'])[:8] if 'id' in org else 'N/A'
        name = org.get('name', 'N/A')
        skip_reason = org.get('assessment_skip_reason', 'N/A')
        print(f"  [{i+1:3}] ID: {org_id_short} | Name: {name[:50]:<50} | Parked Reason: {skip_reason:<20} | Missing: {', '.join(reasons)}")

def unpark_organization(org_id: str):
    try:
        resp = supabase.table("organizations").update({"assessment_skip_reason": None}).eq("id", org_id).execute()
        if resp.data:
            _log(f"Successfully unparked organization {org_id}")
            return True
        else:
            _log(f"Failed to unpark organization {org_id}: No data returned. It might have been updated concurrently or doesn't exist.")
            return False
    except Exception as e:
        _log(f"Error unparking organization {org_id}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Interactive CLI for managing unprocessed jobs and organizations.")
    parser.add_argument("--include-parked", action="store_true", help="Include previously parked organizations for processing.")
    args = parser.parse_args()

    while True:
        print("\n" + "=" * 80)
        print("Interactive Unprocessed Review Tool")
        print("=" * 80)

        unprocessed_jobs_raw = find_unprocessed_jobs()
        unprocessed_orgs_raw = find_unprocessed_organizations(include_parked=args.include_parked)

        print(f"Found {len(unprocessed_jobs_raw)} unprocessed jobs.")
        print(f"Found {len(unprocessed_orgs_raw)} unprocessed organizations (including parked={args.include_parked}).")

        display_jobs(unprocessed_jobs_raw)
        display_organizations(unprocessed_orgs_raw)

        print("\n--- Actions ---")
        print("j: Re-process all unprocessed jobs")
        print("o: Re-assess all unprocessed organizations")
        print("u [ORG_NUM]: Unpark a specific organization (by its displayed number)")
        print("r: Refresh lists")
        print("q: Quit")

        choice = input("\nEnter your choice: ").strip().lower()

        if choice == 'q':
            break
        elif choice == 'r':
            continue
        elif choice == 'j':
            if unprocessed_jobs_raw:
                _log("\n--- Re-processing Jobs ---")
                ok, err = process_unprocessed_jobs(unprocessed_jobs_raw)
                _log(f"Jobs: {ok} processed, {err} errors.")
            else:
                print("No jobs to process.")
        elif choice == 'o':
            if unprocessed_orgs_raw:
                _log("\n--- Re-assessing Organizations ---")
                ok, err = process_unprocessed_orgs(unprocessed_orgs_raw)
                _log(f"Organizations: {ok} completed, {err} errors.")
            else:
                print("No organizations to assess.")
        elif choice.startswith('u '):
            try:
                org_num = int(choice.split(' ')[1]) - 1
                if 0 <= org_num < len(unprocessed_orgs_raw):
                    selected_org_id = unprocessed_orgs_raw[org_num][0]['id']
                    if unpark_organization(selected_org_id):
                        print(f"Attempted to unpark organization {selected_org_id}. Refreshing list...")
                    else:
                        print(f"Could not unpark organization {selected_org_id}.")
                else:
                    print("Invalid organization number.")
            except (ValueError, IndexError):
                print("Invalid command. Use 'u [ORG_NUM]'.")
        else:
            print("Invalid choice. Please try again.")

if __name__ == "__main__":
    main()
