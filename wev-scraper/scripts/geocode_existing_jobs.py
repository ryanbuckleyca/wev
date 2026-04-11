#!/usr/bin/env python
"""Batch geocoder for existing jobs in Supabase.

Re-parses location strings for jobs already in the database using LLM-based location extraction.
"""

import argparse
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

# Ensure project root is on sys.path so `utils` is importable when running scripts directly
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Load .env from the project root (wev-scraper/), not the scripts/ directory.
load_dotenv(Path(PROJECT_ROOT) / '.env')
load_dotenv()  # fallback from CWD

# --prod must be checked before utils.db is imported so USE_PROD_DB is set
# before the Supabase client is created at module load time.
if '--prod' in sys.argv[1:]:
    _confirm = os.environ.get("CONFIRM_PROD_RUN")
    if sys.stdin.isatty():
        print("\nWARNING: You are about to run against the PRODUCTION database.")
        print("This will modify real data.\n")
        _resp = input("Type YES to continue, anything else to abort: ")
        if _resp.strip() != "YES":
            print("Aborted.")
            sys.exit(1)
    elif _confirm != "YES":
        print("Refusing to run against production in non-interactive mode. Set CONFIRM_PROD_RUN=YES to override.")
        sys.exit(1)
    os.environ["USE_PROD_DB"] = "1"
    print("🔥 Using PRODUCTION database")
else:
    print("🧪 Using TEST database")

from utils.db import supabase, fetch_all_rows
from utils.llm_location_extractor import extract_locations_for_jobs
from utils.env import is_truthy_env


def geocode_existing_jobs(limit: int = 100, verbose: bool = True) -> dict:
    counts = {
        "geocoded": 0,
        "skipped": 0,
        "errors": 0,
    }
    
    try:
        if verbose:
            print("Fetching jobs from Supabase...")
        
        # Fetch jobs with location info
        columns = "id, location, municipality, province, is_remote, work_type, listing_url"
        if limit and limit > 0:
            resp = (
                supabase.table("jobs")
                .select(columns)
                .order("id", desc=True)
                .range(0, limit - 1)
                .execute()
            )
            jobs = resp.data or []
        else:
            jobs = fetch_all_rows("jobs", columns)
        
        if not jobs:
            if verbose:
                print("No jobs found in database.")
            return counts
        
        if verbose:
            print(f"Found {len(jobs)} jobs to process.")
            print(f"Extracting locations using LLM (batch processing)...\n")
        
        # Filter out jobs with no location
        jobs_to_process = []
        for job in jobs:
            location = job.get("location")
            if not location or not location.strip():
                if verbose:
                    job_url = job.get('listing_url', 'no URL')
                    print(f"Skipped job ({job_url}) - no location")
                counts["skipped"] += 1
            else:
                jobs_to_process.append(job)
        
        if not jobs_to_process:
            if verbose:
                print("\nNo jobs to process.")
            return counts
        
        # Extract locations using LLM in batches
        if verbose:
            print(f"Processing {len(jobs_to_process)} jobs with LLM...")
        
        try:
            extract_locations_for_jobs(jobs_to_process)
        except Exception as e:
            if verbose:
                print(f"Error during LLM extraction: {e}")
            counts["errors"] = len(jobs_to_process)
            return counts
        
        # Update database for each job
        if verbose:
            print("\nUpdating database...")
        
        for i, job in enumerate(jobs_to_process, 1):
            job_id = job.get("id")
            
            try:
                # Update database
                update_data = {
                    "work_type": job.get("work_type", "office"),
                    "municipality": job.get("municipality"),
                    "province": job.get("province"),
                    "is_remote": job.get("is_remote", False),
                }
                
                supabase.table("jobs").update(update_data).eq("id", job_id).execute()
                
                if verbose:
                    muni = job.get('municipality') or 'None'
                    prov = job.get('province') or 'None'
                    work_type = job.get('work_type', 'office')
                    work_tag = f" [{work_type.upper()}]" if work_type != 'office' else ""
                    location_display = f"{muni}, {prov}{work_tag}"
                    print(f"{i}/{len(jobs_to_process)}: {job.get('location', '')} → {location_display}")
                
                counts["geocoded"] += 1
                
            except Exception as e:
                if verbose:
                    print(f"{i}/{len(jobs_to_process)}: Error updating - {e}")
                counts["errors"] += 1
        
        if verbose:
            print(f"\nGeocoding complete:")
            print(f"  Geocoded: {counts['geocoded']}")
            print(f"  Skipped: {counts['skipped']}")
            print(f"  Errors: {counts['errors']}")
        
        return counts
    
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Re-geocode locations for existing jobs in Supabase."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum jobs to process (0 for all jobs). Default: 100"
    )
    parser.add_argument("--prod", action="store_true", help="Use production database (confirmed at startup).")

    args = parser.parse_args()
    
    if not is_truthy_env("SHOULD_GEOCODE"):
        print("⚠️  SHOULD_GEOCODE is not set.")
        print("Run with: SHOULD_GEOCODE=1 python geocode_existing_jobs.py")
        sys.exit(1)
    
    print("Starting geocoding of existing jobs...\n")
    geocode_existing_jobs(limit=args.limit, verbose=True)


if __name__ == "__main__":
    main()
