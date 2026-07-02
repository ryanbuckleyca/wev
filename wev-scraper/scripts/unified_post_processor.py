#!/usr/bin/env python
"""Unified post-processor using the unified LLM approach.

Replaces separate classify_existing_jobs.py, tag_job_values.py, and tag_job_skills.py
with a single unified processor that extracts all data in one LLM call.

Usage:
    python unified_post_processor.py [--task sse|values|summary|all] [--limit N]
        [--staging] [--job-id ID ...] [--dry-run] [--verbose]

    Targets local DB by default. Use --staging for .env.staging.
    Does not support --prod or --publish (no production writes from this tool).
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal

from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

# Load env before any DB import. We can't rely on dotenv-cli at the npm layer
# because it is first-wins (won't override .env values from .env.production).
# Mirror scrape.py: always load .env; --staging loads .env.staging overrides.
from settings import (  # noqa: E402
    ensure_env_loaded,
)

ensure_env_loaded()
from utils.prod_env import bootstrap_staging_from_argv  # noqa: E402

if "--prod" in sys.argv or "--publish" in sys.argv:
    print(
        "Error: process does not support --prod or --publish. "
        "Use local (default) or --staging. Production post-processing "
        "should run in a controlled environment, not from npm run process.",
        file=sys.stderr,
    )
    sys.exit(2)

bootstrap_staging_from_argv(sys.argv, Path(__file__))

# Deferred imports: `utils.db`, `llm.factory`, and `utils.log` transitively load clients
# that read `os.environ` (Supabase URL/keys, LLM provider config). Import them only after
# the `--staging` bootstrap above so the right DB target and keys are set.
# noqa: E402 — imports intentionally follow executable env setup; silences ruff/flake8.
from llm.factory import get_unified_processor  # noqa: E402
from utils.db import supabase  # noqa: E402
from utils.log import scraper_log  # noqa: E402

VALID_LANGUAGES = frozenset({"en", "fr", "bilingual"})

TaskType = Literal["all", "summary", "values", "sse", "language"]


@dataclass
class ProcessingOptions:
    """Options that control how process_jobs_unified fetches and filters jobs."""
    task: TaskType = "all"
    page_limit: int | None = 100
    job_ids: List[str] = field(default_factory=list)
    dry_run: bool = False
    verbose: bool = False
    since_days: int | None = None
    # Only meaningful when task="language": skips the already-tagged check and
    # re-processes every fetched job regardless of its current language value.
    force_language_reprocess: bool = False


def _fetch_jobs(
    job_ids: List[str] | None,
    since_days: int | None,
    page_limit: int | None,
    before_scraped_at: str | None = None,
) -> List[Dict[str, Any]]:
    """Fetch jobs from the database.

    When job_ids are provided, fetches exactly those jobs (page_limit ignored).
    Otherwise fetches the most-recently-scraped jobs, optionally filtered by
    scraped_at age, up to `page_limit` rows per page. Pass page_limit=None to fetch all
    rows in a single page. Uses cursor-based pagination via before_scraped_at.
    """
    query = supabase.table("jobs").select(
        "id, description, summary, values, is_sse, sse_details, language, scraped_at, "
        "organization, job_title, location, employment_type, wage"
    )

    if job_ids:
        query = query.in_("id", job_ids)
    else:
        if since_days:
            cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
            query = query.gte("scraped_at", cutoff.isoformat())

        if before_scraped_at:
            query = query.lt("scraped_at", before_scraped_at)

        query = query.order("scraped_at", desc=True)

        if page_limit is not None:
            query = query.limit(page_limit)

    return query.execute().data


def _needs_processing(job: Dict[str, Any], opts: ProcessingOptions) -> bool:
    """Return True if a job requires processing for the given task."""
    if opts.task == "all":
        return (
            not (job.get("summary") or "").strip()
            or not job.get("values")
            or job.get("is_sse") is None
            or job.get("language") not in VALID_LANGUAGES
        )
    if opts.task == "sse":
        return job.get("is_sse") is None
    if opts.task == "values":
        return not job.get("values")
    if opts.task == "summary":
        return not job.get("summary")
    if opts.task == "language":
        return opts.force_language_reprocess or job.get("language") not in VALID_LANGUAGES
    raise ValueError(f"Unknown task: {opts.task!r}")


def process_jobs_unified(opts: ProcessingOptions | None = None) -> Dict[str, Any]:
    """Process jobs using unified LLM approach.

    Args:
        opts: Processing options. Defaults to ProcessingOptions() if not provided.

    Returns:
        Processing counts and results
    """
    if opts is None:
        opts = ProcessingOptions()

    counts = {
        "processed": 0,
        "updated": {"sse": 0, "values": 0, "summary": 0, "language": 0},
        "skipped": 0,
        "errors": 0,
        "provider_used": None
    }

    print("=" * 70)
    print("UNIFIED POST-PROCESSOR")
    if opts.task == "all":
        print("Task: all (summary + values + sse + language)")
    else:
        print(f"Task: {opts.task}")
    print(f"Dry run: {opts.dry_run}")
    print("=" * 70)

    task_descriptions = {
        "summary": "Job summarization (1 sentence)",
        "values": "Values tagging (from taxonomy)",
        "sse": "SSE classification (no Google Search unless FORCE_GROUNDING=1)",
        "language": "Language tagging (en, fr, or bilingual)",
    }

    if opts.task == "all":
        print("✓ Tasks to perform:")
        for t in ["summary", "values", "sse", "language"]:
            print(f"  - {task_descriptions[t]}")
    else:
        print(f"✓ Task to perform: {task_descriptions.get(opts.task, opts.task)}")
    print()

    try:
        processor = get_unified_processor()
        print("✓ Unified processor initialized")
    except Exception as e:
        scraper_log(f"✗ Failed to initialize unified processor: {e}")
        counts["errors"] += 1
        return counts

    # Fetch and filter jobs (paginated)
    cursor: str | None = None
    page = 0
    all_eligible: list = []

    while True:
        page += 1
        try:
            jobs = _fetch_jobs(
                opts.job_ids or None, opts.since_days, opts.page_limit, before_scraped_at=cursor
            )
        except Exception as e:
            scraper_log(f"✗ Failed to fetch jobs: {e}")
            counts["errors"] += 1
            return counts

        if not jobs:
            if page == 1:
                print("✓ No jobs found.")
            break

        eligible = [job for job in jobs if _needs_processing(job, opts)]
        counts["skipped"] += len(jobs) - len(eligible)
        all_eligible.extend(eligible)
        print(f"✓ Fetched {len(jobs)} jobs (page {page}), {len(eligible)} eligible")

        if opts.page_limit and len(jobs) == opts.page_limit:
            cursor = jobs[-1]["scraped_at"]
        else:
            break

        if opts.job_ids:
            break

    if not all_eligible:
        print("No eligible jobs to process.")
        return counts

    print(f"✓ Total: {len(all_eligible)} eligible across {page} page(s)")

    # Process in batches
    batch_size = 10
    processed_count = 0
    result: dict = {}
    for i in range(0, len(all_eligible), batch_size):
        batch = all_eligible[i:i + batch_size]
        total_batches = (len(all_eligible) + batch_size - 1) // batch_size
        print(f"  Processing batch {i//batch_size + 1}/{total_batches} ({len(batch)} jobs)")

        try:
            result = processor.process_jobs(batch)
        except Exception as e:
            scraper_log(f"✗ Batch processing failed: {e}")
            counts["errors"] += len(batch)
            continue

        if result is None:
            scraper_log("✗ Processing failed: processor returned None")
            counts["errors"] += len(batch)
            continue

        if result.get("error"):
            scraper_log(f"✗ Processing failed: {result['error']}")
            counts["errors"] += len(batch)
            continue

        results_list = result.get("results", [])
        if len(results_list) != len(batch):
            scraper_log(
                f"✗ Result count mismatch: expected {len(batch)}, got {len(results_list)}"
            )
            counts["errors"] += len(batch)
            continue

        for job, job_result in zip(batch, results_list, strict=True):
            if not isinstance(job_result, dict) or not job_result:
                scraper_log(f"✗ Invalid or empty result for job {job['id']}")
                counts["errors"] += 1
                continue

            if not opts.dry_run:
                update_data = _build_update_data(opts.task, job_result, job)
                if update_data:
                    try:
                        _try_db_write(job, update_data, supabase)
                        if "summary" in update_data:
                            counts["updated"]["summary"] += 1
                        if "values" in update_data:
                            counts["updated"]["values"] += 1
                        if "is_sse" in update_data:
                            counts["updated"]["sse"] += 1
                        if "language" in update_data:
                            counts["updated"]["language"] += 1
                        processed_count += 1
                    except Exception as e:
                        scraper_log(f"✗ DB write permanently failed for job {job['id']}: {e}")
                        counts["errors"] += 1
            else:
                processed_count += 1

            if opts.verbose:
                actions = [k for k in ("summary", "values", "language") if k in job_result]
                if "is_sse" in job_result:
                    actions.append("SSE")
                print(f"  ✓ Processed job {job['id'][:8]}... ({', '.join(actions) or 'no actions'})")

    counts["processed"] = processed_count
    if result:
        counts["provider_used"] = result.get("provider")
        print(f"✓ Processing complete using {result.get('provider')}")
    else:
        print("✓ Processing complete (no provider results)")

    return counts


def _build_update_data(task: TaskType, job_result: dict, job: dict | None = None) -> dict:
    """Build the DB update payload from a single job's LLM result.

    ``job`` is the current persisted job record. When ``task`` is ``"all"``,
    the language field is only written when the stored value is missing or
    differs from the LLM result, preventing accidental overwrites of a
    previously validated tag.
    """
    update_data: dict = {}

    if task in ["all", "summary"] and job_result.get("summary"):
        update_data["summary"] = job_result["summary"]

    if task in ["all", "values"] and job_result.get("values"):
        update_data["values"] = job_result["values"]
        if job_result.get("values_rated"):
            update_data["values_rated"] = job_result["values_rated"]

    if task in ["all", "sse"] and "is_sse" in job_result:
        update_data["is_sse"] = job_result["is_sse"]
        if "sse_confidence" in job_result or "sse_details" in job_result:
            update_data["sse_details"] = json.dumps({
                "confidence": job_result.get("sse_confidence", 0.0),
                "reasoning": job_result.get("sse_details", "Generated by unified processor")
            })

    new_language = job_result.get("language")
    if new_language in VALID_LANGUAGES:
        if task == "language":
            # Explicit language run: always write.
            update_data["language"] = new_language
        elif task == "all":
            # Only write when there is no stored value or it differs from the
            # LLM result, so a previously validated tag is not clobbered.
            stored_language = (job or {}).get("language")
            if not stored_language or stored_language != new_language:
                update_data["language"] = new_language
        # For single-field tasks (summary, values, sse) the LLM still returns a
        # language field, but we intentionally don't write it — those runs are
        # scoped and should not mutate fields they weren't asked to update.

    return update_data


def is_transient_db_error(e: Exception) -> bool:
    """Return True if the DB error is transient and should be retried."""
    code = getattr(e, "code", None)
    if code:
        code_str = str(code)
        # Postgres transient codes (53xxx, 08xxx) or specific PostgREST gateway errors
        if code_str.startswith("53") or code_str.startswith("08"):
            return True
        if code_str in ("502", "503", "504"):
            return True

    err_name = type(e).__name__
    if err_name in ("TimeoutError", "ConnectionError", "ReadTimeout"):
        return True
    return False

@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2),
    retry=retry_if_exception(is_transient_db_error)
)
def _try_db_write(job: dict, update_data: dict, db_client) -> None:
    """Attempt a single DB write, automatically retrying on transient failures.

    Raises an exception if it permanently fails after retries.
    """
    try:
        db_client.table("jobs").update(update_data).eq("id", job["id"]).execute()
    except Exception as db_err:
        code = getattr(db_err, "code", None)
        pg_code = f" [PG:{code}]" if code else ""
        scraper_log(f"✗ DB write attempt failed for job {job['id']}{pg_code}: {db_err}")
        raise


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Unified post-processor for jobs")
    parser.add_argument("--task", choices=["sse", "values", "summary", "language", "all"],
                       default="all", help="What to process")
    parser.add_argument("--since-days", type=int, help="Process jobs created since N days ago")
    parser.add_argument("--force-language-reprocess", action="store_true",
                        help="Force re-processing of language tags even if already present and valid.")
    parser.add_argument("--page-limit", "--limit", dest="page_limit", type=int, default=100,
                        help="Rows per page (default: 100). Supports legacy --limit. "
                             "Paginates automatically to process all eligible jobs.")
    parser.add_argument("--job-id", nargs="+", help="Specific job IDs to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to database")
    parser.add_argument(
        "--env",
        choices=["local", "staging"],
        default="local",
        help="Target environment (default: local)",
    )
    parser.add_argument(
        "--staging",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    parser.add_argument("--verbose", action="store_true", help="Detailed logging")

    args = parser.parse_args()

    # Process jobs
    result = process_jobs_unified(ProcessingOptions(
        task=args.task,
        page_limit=args.page_limit,
        job_ids=args.job_id or [],
        dry_run=args.dry_run,
        verbose=args.verbose,
        since_days=args.since_days,
        force_language_reprocess=args.force_language_reprocess,
    ))

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
    if result['updated']['language'] > 0:
        print(f"Language tags updated: {result['updated']['language']}")

    print(f"Errors: {result['errors']}")

    if result['errors'] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
