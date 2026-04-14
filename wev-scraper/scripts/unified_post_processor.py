#!/usr/bin/env python
"""Unified post-processor using the unified LLM approach.

Replaces separate classify_existing_jobs.py, tag_job_values.py, and tag_job_skills.py
with a single unified processor that extracts all data in one LLM call.

Usage:
    python unified_post_processor.py [--task sse|values|skills|all] [--limit N]
"""

import argparse
import os
import sys
from typing import Any, Dict, List

# Set production flag BEFORE importing db module
if "--prod" in sys.argv:
    os.environ["USE_PROD_DB"] = "1"

from llm.factory import get_unified_processor
from utils.db import supabase
from utils.log import scraper_log


def process_jobs_unified(
    task: str = "all",
    limit: int = 100,
    job_ids: List[str] | None = None,
    dry_run: bool = False,
    verbose: bool = False,
) -> Dict[str, Any]:
    """Process jobs using unified LLM approach.

    Args:
        task: What to process - "sse", "values", "skills", or "all"
        limit: Maximum jobs to process
        job_ids: Specific job IDs to process
        dry_run: Don't save to database
        verbose: Detailed logging

    Returns:
        Processing counts and results
    """
    counts = {
        "processed": 0,
        "updated": {"sse": 0, "values": 0, "skills": 0, "summary": 0},
        "skipped": 0,
        "errors": 0,
        "provider_used": None
    }

    print("=" * 70)
    print("UNIFIED POST-PROCESSOR")
    print(f"Task: {task}")
    print(f"Limit: {limit}")
    print(f"Dry run: {dry_run}")
    print("=" * 70)

    # Show what tasks will be performed
    task_descriptions = {
        "summary": "Job summarization (1 sentence)",
        "values": "Values tagging (from taxonomy)",
        "sse": "SSE classification (with web search grounding)"
    }

    if task == "all":
        print("✓ Tasks to perform:")
        for t in ["summary", "values", "sse"]:
            print(f"  - {task_descriptions[t]}")
    else:
        print(f"✓ Task to perform: {task_descriptions.get(task, task)}")
    print()

    # Initialize unified processor
    try:
        processor = get_unified_processor()
        print("✓ Unified processor initialized")
    except Exception as e:
        scraper_log(f"✗ Failed to initialize unified processor: {e}")
        counts["errors"] += 1
        return counts

    # Fetch jobs
    try:
        if job_ids:
            jobs = supabase.table("jobs").select("*").in_("id", job_ids).execute().data
        else:
            # Use the working query approach from our test
            print("  Query: SELECT * FROM jobs with high limit")

            # Test count first
            count_result = supabase.table("jobs").select("id", count="exact").execute()
            print(f"  Count check: {count_result.count}")

            jobs = supabase.table("jobs").select("*").limit(1000).execute().data

        print(f"✓ Fetched {len(jobs)} jobs")
    except Exception as e:
        scraper_log(f"✗ Failed to fetch jobs: {e}")
        counts["errors"] += 1
        return counts

    # Process in smaller batches to avoid LLM token limits
    batch_size = 10
    all_filtered_jobs = []

    for i in range(0, len(jobs), batch_size):
        batch_jobs = jobs[i:i + batch_size]
        print(f"  Processing batch {i//batch_size + 1}/{(len(jobs) + batch_size - 1)//batch_size} ({len(batch_jobs)} jobs)")

        # Filter jobs in this batch based on task
        filtered_batch = []
        for job in batch_jobs:
            should_process = False

            if task == "all":
                summary = job.get("summary", "")
                values = job.get("values", [])
                is_sse = job.get("is_sse")
                sse_details = job.get("sse_details", "")

                should_process = (
                    not summary or not summary.strip() or
                    not values or len(values) == 0 or
                    is_sse is None or
                    not sse_details or not sse_details.strip()
                )
            elif task == "sse":
                should_process = job.get("is_sse") is None
            elif task == "values":
                should_process = not job.get("values")
            elif task == "summary":
                should_process = not job.get("summary")

            if should_process:
                filtered_batch.append(job)

        all_filtered_jobs.extend(filtered_batch)
        print(f"    ✓ Batch {i//batch_size + 1}: {len(filtered_batch)} eligible jobs")

    filtered_jobs = all_filtered_jobs
    print(f"✓ Filtered to {len(filtered_jobs)} eligible jobs total")

    if not filtered_jobs:
        print("No eligible jobs to process.")
        return counts

    # Process in smaller batches using unified processor
    try:
        # Process filtered jobs in smaller batches
        processed_count = 0
        for i in range(0, len(filtered_jobs), batch_size):
            batch = filtered_jobs[i:i + batch_size]
            print(f"  Processing batch {i//batch_size + 1}/{(len(filtered_jobs) + batch_size - 1)//batch_size} ({len(batch)} jobs)")

            result = processor.process_jobs(batch)

            if result.get("error"):
                scraper_log(f"✗ Processing failed: {result['error']}")
                counts["errors"] += len(batch)
                continue

            # Update database based on task for this batch
            for job, job_result in zip(batch, result.get("results", []), strict=False):
                    if not dry_run:
                        update_data = {}

                        if task in ["all", "summary"] and job_result.get("summary"):
                            update_data["summary"] = job_result["summary"]

                        if task in ["all", "values"] and job_result.get("values"):
                            update_data["values"] = job_result["values"]
                            if job_result.get("values_rated"):
                                update_data["values_rated"] = job_result["values_rated"]

                        if task in ["all", "sse"] and "is_sse" in job_result:
                            update_data["is_sse"] = job_result["is_sse"]
                            if "sse_confidence" in job_result or "sse_details" in job_result:
                                import json
                                update_data["sse_details"] = json.dumps({
                                    "confidence": job_result.get("sse_confidence", 0.0),
                                    "reasoning": "Generated by unified processor"
                                })

                        if update_data:
                            try:
                                supabase.table("jobs").update(update_data).eq("id", job["id"]).execute()
                                if "summary" in update_data:
                                    counts["updated"]["summary"] += 1
                                if "values" in update_data:
                                    counts["updated"]["values"] += 1
                                if "is_sse" in update_data:
                                    counts["updated"]["sse"] += 1
                                processed_count += 1
                            except Exception as db_err:
                                scraper_log(f"✗ DB write failed for job {job['id']}: {db_err}")
                                counts["errors"] += 1
                                continue
                    else:
                        processed_count += 1

                    if verbose:
                        actions = [k for k in ("summary", "values") if k in (job_result or {})]
                        if "is_sse" in (job_result or {}):
                            actions.append("SSE")
                        print(f"  ✓ Processed job {job['id'][:8]}... ({', '.join(actions) or 'no actions'})")
                    else:
                        scraper_log(f"✗ No result for job {job['id']}")
                        counts["errors"] += 1

        counts["processed"] = processed_count
        counts["provider_used"] = result.get("provider")
        print(f"✓ Processing complete using {result.get('provider')}")

    except Exception as e:
        scraper_log(f"✗ Processing failed: {e}")
        counts["errors"] += len(filtered_jobs)

    return counts


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Unified post-processor for jobs")
    parser.add_argument("--task", choices=["sse", "values", "summary", "all"],
                       default="all", help="What to process")
    parser.add_argument("--limit", type=int, default=100, help="Maximum jobs to process")
    parser.add_argument("--job-id", nargs="+", help="Specific job IDs to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to database")
    parser.add_argument("--verbose", action="store_true", help="Detailed logging")
    parser.add_argument("--prod", action="store_true", help="Run against production database")

    args = parser.parse_args()

    # Handle production flag
    if args.prod:
        confirm = os.environ.get("CONFIRM_PROD_RUN")
        if sys.stdin.isatty():
            print("\nWARNING: You are about to run against the PRODUCTION database.")
            print("This will modify real data.\n")
            resp = input("Type YES to continue, anything else to abort: ")
            if resp.strip() != "YES":
                print("Aborted.")
                sys.exit(1)
        elif confirm != "YES":
            print("Refusing to run against production in non-interactive mode. Set CONFIRM_PROD_RUN=YES to override.")
            sys.exit(1)

        os.environ["USE_PROD_DB"] = "1"

    # Process jobs
    result = process_jobs_unified(
        task=args.task,
        limit=args.limit,
        job_ids=args.job_id,
        dry_run=args.dry_run,
        verbose=args.verbose
    )

    # Print summary
    print("\n" + "=" * 70)
    print("UNIFIED PROCESSING SUMMARY")
    print("=" * 70)
    print(f"Processed: {result['processed']}")
    print(f"Skipped: {result['skipped']}")
    print(f"Provider used: {result['provider_used']}")

    if result['updated']['summary'] > 0:
        print(f"Summaries updated: {result['updated']['summary']}")
    if result['updated']['values'] > 0:
        print(f"Values updated: {result['updated']['values']}")
    if result['updated']['sse'] > 0:
        print(f"SSE classifications updated: {result['updated']['sse']}")

    print(f"Errors: {result['errors']}")

    if result['errors'] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
