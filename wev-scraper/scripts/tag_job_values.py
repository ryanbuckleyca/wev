#!/usr/bin/env python
"""Batch processor for job work-value tagging."""

from __future__ import annotations

import argparse
import os
import sys
import time

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

# USE_PROD_DB must be set before importing utils.db, which creates the Supabase client at module load time.
from utils.db import fetch_all_rows, supabase  # noqa: E402
from utils.env import is_truthy_env  # noqa: E402
from utils.job_values_tagger import JobValuesTagger, JobValuesTaggerError  # noqa: E402


def _should_skip_existing(job: dict, retag: bool) -> bool:
    if retag:
        return False
    existing = job.get("values")
    if isinstance(existing, list) and len(existing) > 0:
        return True
    return False


def _has_text_evidence(job: dict) -> bool:
    return any(
        (job.get(key) or "").strip()
        for key in ("job_title", "summary", "description")
    )


def tag_job_values(
    *,
    job_id: str | None = None,
    limit: int = 100,
    batch_size: int = 10,
    start_batch: int = 1,
    delay_seconds: float = 2.0,
    retag: bool = False,
    dry_run: bool = False,
    verbose: bool = True,
) -> dict:
    """Tag jobs with work values and persist to jobs.values."""
    offset_jobs = (start_batch - 1) * batch_size
    counts = {
        "tagged": 0,
        "skipped_existing": 0,
        "skipped_no_text": 0,
        "errors": 0,
    }

    if verbose:
        print("=" * 70)
        print("JOB VALUES TAGGER")
        print("=" * 70)
        if job_id:
            print(f"Mode: single job ({job_id})")
        else:
            print(f"Batch mode: {batch_size} jobs per API call")
            print(f"Rate limit delay: {delay_seconds}s between batches")
            if start_batch > 1:
                print(f"Starting from batch {start_batch} (skipping {offset_jobs} jobs)")
            print(f"Retag existing values: {'yes' if retag else 'no'}")
            print(f"Dry run: {'yes' if dry_run else 'no'}")
        print()

    try:
        tagger = JobValuesTagger()
        if verbose:
            # Determine which provider is actually being used
            provider_name = type(tagger.provider).__name__.replace('Provider', '').lower()
            provider_model = getattr(tagger.provider, '_model', 'default')

            if provider_name == 'groq':
                print(f"✓ {provider_name.title()} values tagger initialized ({provider_model})")
                key = os.environ.get("GROQ_API_KEY") or ""
                if key:
                    print(f"  GROQ_API_KEY (last4): {key[-4:]}")
                else:
                    print("  GROQ_API_KEY not set")
            elif provider_name == 'gemini':
                print(f"✓ {provider_name.title()} values tagger initialized ({provider_model})")
                if provider_model == 'gemini-2.5-flash-lite':
                    print("  Using fallback (Groq unavailable)")
                key = os.environ.get("GEMINI_API_KEY") or ""
                if key:
                    print(f"  GEMINI_API_KEY (last4): {key[-4:]}")
                else:
                    print("  GEMINI_API_KEY not set")
        print()
    except JobValuesTaggerError as e:
        print(f"✗ Failed to initialize values tagger: {e}")
        return counts

    columns = "id, organization, job_title, location, employment_type, wage, summary, description, values, listing_url"

    try:
        if job_id:
            resp = supabase.table("jobs").select(columns).eq("id", job_id).execute()
            jobs = resp.data or []
        elif limit > 0:
            start = max(offset_jobs, 0)
            resp = (
                supabase.table("jobs")
                .select(columns)
                .order("id", desc=True)
                .range(start, start + limit - 1)
                .execute()
            )
            jobs = resp.data or []
        else:
            jobs = fetch_all_rows("jobs", columns, start_offset=max(offset_jobs, 0))
    except Exception as e:
        print(f"✗ Database query failed: {e}")
        counts["errors"] += 1
        return counts

    if job_id and not jobs:
        print(f"✗ Job not found: {job_id}")
        counts["errors"] += 1
        return counts

    if not jobs:
        print("No jobs found to process.")
        return counts

    # Local filtering keeps logic simple around empty-array semantics.
    filtered: list[dict] = []
    for job in jobs:
        if _should_skip_existing(job, retag=retag):
            counts["skipped_existing"] += 1
            continue
        if not _has_text_evidence(job):
            counts["skipped_no_text"] += 1
            continue
        filtered.append(job)

    if not filtered:
        print("No eligible jobs to tag after filtering.")
        return counts

    if verbose:
        print(f"Processing {len(filtered)} eligible jobs...\n")

    total_batches = (len(filtered) + batch_size - 1) // batch_size
    for batch_idx in range(0, len(filtered), batch_size):
        batch_jobs = filtered[batch_idx:batch_idx + batch_size]
        batch_num = (batch_idx // batch_size) + start_batch
        print(f"[Batch {batch_num}/{total_batches + start_batch - 1}] Processing {len(batch_jobs)} jobs...")

        try:
            results = tagger.tag_jobs_batch(batch_jobs, max_values=5)
        except JobValuesTaggerError as e:
            print(f"  ✗ Batch tagging failed: {e}")
            counts["errors"] += len(batch_jobs)
            continue
        except Exception as e:
            print(f"  ✗ Unexpected batch error: {e}")
            counts["errors"] += len(batch_jobs)
            continue

        for job, result in zip(batch_jobs, results, strict=False):
            job_id_value = job.get("id")
            title = job.get("job_title", "Unknown")
            org = job.get("organization", "Unknown")
            listing_url = job.get("listing_url", "No URL")
            values = result.get("values", [])

            if verbose:
                print(f"\n  {org} - {title}")
                print(f"  URL: {listing_url}")
                print(f"  Values: {values}")
                reasoning = (result.get("reasoning") or "").strip()
                if reasoning:
                    print(f"  Reasoning: {reasoning}")

            if dry_run:
                counts["tagged"] += 1
                continue

            try:
                update_payload: dict = {"values": values}
                values_rated = result.get("values_rated")
                if values_rated:
                    update_payload["values_rated"] = values_rated
                supabase.table("jobs").update(update_payload).eq("id", job_id_value).execute()
                counts["tagged"] += 1
                if verbose:
                    print("    ✓ Updated")
            except Exception as e:
                counts["errors"] += 1
                print(f"    ✗ Database update failed: {e}")

        print()

        if batch_idx + batch_size < len(filtered) and delay_seconds > 0:
            if verbose:
                print(f"Rate limiting: waiting {delay_seconds}s...")
            time.sleep(delay_seconds)

    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Tagged: {counts['tagged']}")
    print(f"Skipped (already tagged): {counts['skipped_existing']}")
    print(f"Skipped (no text evidence): {counts['skipped_no_text']}")
    print(f"Errors: {counts['errors']}")
    print()

    return counts


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Tag jobs with work values and update jobs.values."
    )
    parser.add_argument("--job-id", type=str, help="Tag a single job by UUID.")
    parser.add_argument("--limit", type=int, default=100, help="Max jobs to process (0 = no limit).")
    parser.add_argument("--batch", type=int, default=1, help="Start from this batch number (default: 1).")
    parser.add_argument("--batch-size", type=int, default=10, help="Jobs per LLM batch call.")
    parser.add_argument("--delay", type=float, default=2.0, help="Delay between batches in seconds.")
    parser.add_argument("--retag", action="store_true", help="Retag jobs even if values already exist.")
    parser.add_argument("--dry-run", action="store_true", help="Run tagging without database updates.")
    parser.add_argument("--quiet", action="store_true", help="Reduce output.")
    parser.add_argument("--prod", action="store_true", help="Use production database (confirmed at startup).")
    args = parser.parse_args()

    if not is_truthy_env("SHOULD_TAG_VALUES"):
        print("Values tagging is disabled (set SHOULD_TAG_VALUES=1).")
        return 1

    retag = args.retag or is_truthy_env("SHOULD_RE_TAG_VALUES")
    tag_job_values(
        job_id=args.job_id,
        limit=args.limit,
        batch_size=args.batch_size,
        start_batch=args.batch,
        delay_seconds=args.delay,
        retag=retag,
        dry_run=args.dry_run,
        verbose=not args.quiet,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
