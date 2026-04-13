#!/usr/bin/env python
"""Clean up duplicate jobs based on listing_url.

Usage:
    python scripts/cleanup_job_duplicates.py --dry-run          # preview (test DB)
    python scripts/cleanup_job_duplicates.py                    # delete dupes (test DB)
    python scripts/cleanup_job_duplicates.py --prod --dry-run   # preview (prod DB)
    python scripts/cleanup_job_duplicates.py --prod             # delete dupes (prod DB)
"""

import argparse
import os
import sys
from collections import defaultdict


# --prod must be checked before utils.db is imported so USE_PROD_DB is set
# before the Supabase client is created at module load time.
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
        print("Refusing to run against production in non-interactive mode. Set CONFIRM_PROD_RUN=YES to override.")
        sys.exit(1)
    os.environ["USE_PROD_DB"] = "1"
    print("Using PRODUCTION database")
else:
    print("Using TEST database")

from utils.db import supabase, fetch_all_rows


def _row_quality_score(job: dict) -> tuple:
    """Higher score = more data. Used to pick the best row to keep."""
    values = job.get("values")
    has_values = isinstance(values, list) and len(values) > 0
    has_summary = bool((job.get("summary") or "").strip())
    has_description = bool((job.get("description") or "").strip())
    return (has_values, has_summary, has_description, job.get("scraped_at", ""))


def cleanup_job_duplicates(dry_run: bool = False):
    """Find and remove duplicate jobs. Keeps the row with the most data."""

    print("Fetching all jobs (paginated)...")
    jobs = fetch_all_rows(
        "jobs",
        "id, organization, job_title, listing_url, values, summary, description, scraped_at",
    )
    print(f"Total jobs: {len(jobs)}")

    groups: dict[str, list[dict]] = defaultdict(list)
    for job in jobs:
        url = (job.get("listing_url") or "").strip().rstrip("/")
        if url:
            groups[url].append(job)

    ids_to_delete: list[str] = []
    for url, group in sorted(groups.items()):
        if len(group) <= 1:
            continue
        group.sort(key=_row_quality_score, reverse=True)
        keeper = group[0]
        dupes = group[1:]
        print(f"\n  Keep: {url} (id={keeper['id']})")
        for d in dupes:
            print(f"  Delete: id={d['id']}")
            ids_to_delete.append(d["id"])

    if not ids_to_delete:
        print("\nNo duplicates found.")
        return

    print(f"\nDuplicates to delete: {len(ids_to_delete)}")
    print(f"Jobs remaining after cleanup: {len(jobs) - len(ids_to_delete)}")

    if dry_run:
        print("DRY RUN — no rows deleted.")
        return

    batch_size = 100
    deleted = 0
    for i in range(0, len(ids_to_delete), batch_size):
        batch = ids_to_delete[i : i + batch_size]
        try:
            resp = supabase.table("jobs").delete().in_("id", batch).execute()
            n = len(resp.data) if resp.data else 0
            deleted += n
            print(f"  Batch {i // batch_size + 1}: deleted {n}")
        except Exception as e:
            print(f"  Batch {i // batch_size + 1}: error — {e}")

    print(f"\nDone. Deleted {deleted} duplicate rows.")


def main():
    parser = argparse.ArgumentParser(
        description="Remove duplicate jobs by listing_url, keeping the best row."
    )
    parser.add_argument("--prod", action="store_true", help="Use production database (confirmed at startup).")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be deleted without actually deleting.")
    args = parser.parse_args()
    cleanup_job_duplicates(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
