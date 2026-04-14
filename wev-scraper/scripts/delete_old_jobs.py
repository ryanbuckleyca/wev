#!/usr/bin/env python3
"""Delete jobs older than a specified number of days from the database."""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# Load environment variables from repo root
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())


def query_old_jobs(supabase_url: str, service_role_key: str, days_old: int) -> list[dict]:
    """Query jobs older than the specified number of days."""
    base_url = supabase_url.rstrip("/")
    
    # Calculate cutoff date (format for PostgREST)
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_old)).strftime('%Y-%m-%dT%H:%M:%S')
    
    # Query jobs older than cutoff
    endpoint = f"{base_url}/rest/v1/jobs?select=id,job_title,organization,date_posted,scraped_at&scraped_at=lt.{cutoff_date}"
    
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Accept": "application/json",
    }
    
    req = Request(endpoint, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=30) as resp:
            body = resp.read()
            jobs = json.loads(body.decode("utf-8"))
            return jobs if isinstance(jobs, list) else []
    except (HTTPError, URLError) as e:
        print(f"Error querying jobs: {e}")
        if hasattr(e, 'read'):
            print(f"Response: {e.read().decode('utf-8', errors='replace')[:500]}")
        return []


def delete_jobs(supabase_url: str, service_role_key: str, job_ids: list[str]) -> int:
    """Delete jobs by their IDs."""
    base_url = supabase_url.rstrip("/")
    
    # Build filter for multiple IDs
    ids_filter = ",".join(job_ids)
    endpoint = f"{base_url}/rest/v1/jobs?id=in.({ids_filter})"
    
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Prefer": "return=minimal",
    }
    
    req = Request(endpoint, headers=headers, method="DELETE")
    try:
        with urlopen(req, timeout=30) as resp:
            if 200 <= resp.status < 300:
                return len(job_ids)
            return 0
    except (HTTPError, URLError) as e:
        print(f"Error deleting jobs: {e}")
        if hasattr(e, 'read'):
            print(f"Response: {e.read().decode('utf-8', errors='replace')[:500]}")
        return 0


def main():
    parser = argparse.ArgumentParser(description="Delete jobs older than specified days")
    parser.add_argument(
        "--supabase-url",
        default=os.getenv("SUPABASE_PROD_URL") or os.getenv("SUPABASE_URL"),
        help="Supabase project URL",
    )
    parser.add_argument(
        "--supabase-key",
        default=os.getenv("SUPABASE_PROD_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        help="Supabase service role key",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Delete jobs older than this many days (default: 30)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only check and report, don't delete",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of jobs to delete per batch (default: 100)",
    )
    
    args = parser.parse_args()
    
    if not args.supabase_url or not args.supabase_key:
        print("Error: Missing Supabase credentials")
        return 1
    
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=args.days)
    print(f"Querying jobs older than {args.days} days (before {cutoff_date.strftime('%Y-%m-%d')})...")
    
    jobs = query_old_jobs(args.supabase_url, args.supabase_key, args.days)
    
    if not jobs:
        print("No old jobs found.")
        return 0
    
    print(f"\nFound {len(jobs)} jobs to delete:")
    
    # Show sample
    for i, job in enumerate(jobs[:10]):
        scraped = job.get('scraped_at', 'unknown')
        print(f"  {i+1}. {job.get('job_title', 'Untitled')} at {job.get('organization', 'Unknown')} (scraped: {scraped})")
    
    if len(jobs) > 10:
        print(f"  ... and {len(jobs) - 10} more")
    
    if args.dry_run:
        print("\nDry run - no jobs deleted.")
        return 0
    
    # Confirm deletion
    print(f"\n⚠️  This will permanently delete {len(jobs)} jobs from the database.")
    confirm = input("Type 'DELETE' to confirm: ")
    
    if confirm != "DELETE":
        print("Deletion cancelled.")
        return 0
    
    # Delete in batches
    job_ids = [job['id'] for job in jobs]
    total_deleted = 0
    
    for i in range(0, len(job_ids), args.batch_size):
        batch = job_ids[i:i + args.batch_size]
        deleted = delete_jobs(args.supabase_url, args.supabase_key, batch)
        total_deleted += deleted
        print(f"Deleted batch {i // args.batch_size + 1}: {deleted} jobs (total: {total_deleted}/{len(jobs)})")
    
    print(f"\n✓ Successfully deleted {total_deleted} jobs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
