#!/usr/bin/env python
"""Unified post-processor using the unified LLM approach.

Replaces separate classify_existing_jobs.py, tag_job_values.py, and tag_job_skills.py
with a single unified processor that extracts all data in one LLM call.

Usage:
    python unified_post_processor.py [--task sse|values|summary|all] [--limit N]
        [--prod | --publish] [--job-id ID ...] [--dry-run] [--verbose]

    --prod     Load all of .env.production (full prod overrides); force ENV_MODE=prod
               so local-first routing is off (is_local_env() is only True for ENV_MODE=local).
    --publish  Prod DB credentials from .env.production; force ENV_MODE=local so local
               LLMs and on-device embeddings are used.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal

from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

# Load env before any DB import. We can't rely on dotenv-cli at the npm layer
# because it is first-wins (won't override .env values from .env.production).
# Mirror scrape.py: always load .env; --prod loads all of .env.production then sets
# ENV_MODE=prod (anything but local disables local-first LLMs); --publish sets local.
from settings import (  # noqa: E402
    ensure_env_loaded,
    load_db_credentials_only,
    load_env_file,
)

ensure_env_loaded()
_has_prod = "--prod" in sys.argv
_has_publish = "--publish" in sys.argv
if _has_prod and _has_publish:
    print("Error: --prod and --publish are mutually exclusive.", file=sys.stderr)
    sys.exit(2)
if _has_prod or _has_publish:
    _root = Path(__file__).resolve().parent.parent.parent
    _scraper = Path(__file__).resolve().parent.parent
    _prod_env = (
        _root / ".env.production"
        if (_root / ".env.production").exists()
        else _scraper / ".env.production"
    )
    if not _prod_env.exists():
        print(
            f"❌ {_prod_env} not found — required for --prod / --publish.",
            file=sys.stderr,
        )
        sys.exit(1)
    if _has_prod:
        print(f"▶ Loading production overrides from {_prod_env.name}")
        load_env_file(_prod_env)
        # Full prod: .env.production may omit ENV_MODE; base .env often has ENV_MODE=local.
        # is_local_env() is True only for ENV_MODE=local — use ``prod`` so Gemini/Groq from prod file win.
        os.environ["ENV_MODE"] = "prod"
        print("▶ LLM routing: ENV_MODE=prod (not local — use keys from .env.production)", flush=True)
    else:
        applied = load_db_credentials_only(_prod_env)
        print(
            f"▶ Publish mode: loaded {len(applied)} DB credential(s) from "
            f"{_prod_env.name} ({', '.join(applied)}); LLM/feature config kept from .env"
        )
        # Publish: prod DB keys from .env.production, machine-local LLM stack (Ollama, local Jina).
        os.environ["ENV_MODE"] = "local"
        print("▶ LLM routing: ENV_MODE=local (--publish → local LLMs / embeddings)", flush=True)
    os.environ["USE_PROD_DB"] = "1"

# Deferred imports: `utils.db`, `llm.factory`, and `utils.log` transitively load clients
# that read `os.environ` (Supabase URL/keys, LLM provider config). Import them only after
# the `--prod` / `--publish` bootstrap above so the right DB target and keys are set.
# noqa: E402 — imports intentionally follow executable env setup; silences ruff/flake8.
from llm.factory import get_unified_processor  # noqa: E402
from utils.db import supabase  # noqa: E402
from utils.log import scraper_log  # noqa: E402

VALID_LANGUAGES = frozenset({"en", "fr", "bilingual"})


def _fetch_jobs(
    job_ids: List[str] | None,
    since_days: int | None,
    limit: int,
) -> List[Dict[str, Any]]:
    """Fetch jobs from the database.

    When job_ids are provided, fetches exactly those jobs (limit ignored).
    Otherwise fetches the most-recently-scraped jobs, optionally filtered by
    scraped_at age, up to `limit` rows.
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

        query = query.order("scraped_at", desc=True)

        if limit > 0:
            query = query.limit(limit)

    return query.execute().data


def _needs_processing(job: Dict[str, Any], task: str, force_language_reprocess: bool) -> bool:
    """Return True if a job requires processing for the given task."""
    if task == "all":
        return (
            not (job.get("summary") or "").strip()
            or not job.get("values")
            or job.get("is_sse") is None
            or not (job.get("sse_details") or "").strip()
            or job.get("language") not in VALID_LANGUAGES
        )
    if task == "sse":
        return job.get("is_sse") is None
    if task == "values":
        return not job.get("values")
    if task == "summary":
        return not job.get("summary")
    if task == "language":
        return force_language_reprocess or job.get("language") not in VALID_LANGUAGES
    raise ValueError(f"Unknown task: {task!r}")


def process_jobs_unified(
        task: str = "all",
        limit: int = 100,
        job_ids: List[str] | None = None,
        dry_run: bool = False,
        verbose: bool = False,
        since_days: int | None = None,
        force_language_reprocess: bool = False,
    ) -> Dict[str, Any]:
    """Process jobs using unified LLM approach.

    Args:
        task: What to process — "sse", "values", "skills", "summary", "language", or "all"
        limit: Maximum number of rows to fetch from the DB (ignored when job_ids are given).
               Note: post-filter skips may mean fewer than `limit` jobs are actually processed.
        job_ids: Specific job IDs to process
        dry_run: Don't save to database
        verbose: Detailed logging

    Returns:
        Processing counts and results
    """
    counts = {
        "processed": 0,
        "updated": {"sse": 0, "values": 0, "skills": 0, "summary": 0, "language": 0},
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

    task_descriptions = {
        "summary": "Job summarization (1 sentence)",
        "values": "Values tagging (from taxonomy)",
        "sse": "SSE classification (no Google Search unless FORCE_GROUNDING=1)",
        "language": "Language tagging (en, fr, or bilingual)",
    }

    if task == "all":
        print("✓ Tasks to perform:")
        for t in ["summary", "values", "sse", "language"]:
            print(f"  - {task_descriptions[t]}")
    else:
        print(f"✓ Task to perform: {task_descriptions.get(task, task)}")
    print()

    try:
        processor = get_unified_processor()
        print("✓ Unified processor initialized")
    except Exception as e:
        scraper_log(f"✗ Failed to initialize unified processor: {e}")
        counts["errors"] += 1
        return counts

    # Fetch and filter jobs
    try:
        jobs = _fetch_jobs(job_ids, since_days, limit)
        print(f"✓ Fetched {len(jobs)} jobs")
    except Exception as e:
        scraper_log(f"✗ Failed to fetch jobs: {e}")
        counts["errors"] += 1
        return counts

    filtered_jobs = [
        job for job in jobs
        if _needs_processing(job, task, force_language_reprocess)
    ]
    print(f"✓ Filtered to {len(filtered_jobs)} eligible jobs")

    if not filtered_jobs:
        print("No eligible jobs to process.")
        return counts

    # Process in batches
    batch_size = 10
    try:
        processed_count = 0
        result: dict = {}
        for i in range(0, len(filtered_jobs), batch_size):
            batch = filtered_jobs[i:i + batch_size]
            total_batches = (len(filtered_jobs) + batch_size - 1) // batch_size
            print(f"  Processing batch {i//batch_size + 1}/{total_batches} ({len(batch)} jobs)")

            result = processor.process_jobs(batch)

            if result is None:
                scraper_log("✗ Processing failed: processor returned None")
                counts["errors"] += len(batch)
                continue

            if result.get("error"):
                scraper_log(f"✗ Processing failed: {result['error']}")
                counts["errors"] += len(batch)
                continue

            for job, job_result in zip(batch, result.get("results", []), strict=False):
                if not isinstance(job_result, dict) or not job_result:
                    scraper_log(f"✗ Invalid or empty result for job {job['id']}")
                    counts["errors"] += 1
                    continue

                if not dry_run:
                    update_data = _build_update_data(task, job_result, job)
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

                if verbose:
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

    except Exception as e:
        scraper_log(f"✗ Processing failed: {e}")
        counts["errors"] += len(filtered_jobs)

    return counts


TaskType = Literal["all", "summary", "values", "sse", "language"]


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
    if new_language:
        if task == "language":
            # Explicit language run: always write.
            update_data["language"] = new_language
        elif task == "all":
            # Only write when there is no stored value or it differs from the
            # LLM result, so a previously validated tag is not clobbered.
            stored_language = (job or {}).get("language")
            if not stored_language or stored_language != new_language:
                update_data["language"] = new_language

    return update_data


def is_transient_db_error(e: Exception) -> bool:
    """Return True if the DB error is transient and should be retried."""
    code = getattr(e, "code", None)
    if code:
        code_str = str(code)
        # Postgres transient codes (53xxx, 08xxx) or PostgREST 5xx HTTP codes
        if code_str.startswith("53") or code_str.startswith("08") or code_str.startswith("50"):
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
    parser.add_argument("--limit", type=int, default=100, help="Maximum jobs to process")
    parser.add_argument("--job-id", nargs="+", help="Specific job IDs to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to database")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--prod",
        action="store_true",
        help="Full prod: .env.production over .env; ENV_MODE=prod (non-local LLM routing)",
    )
    group.add_argument(
        "--publish",
        action="store_true",
        help="Prod DB creds from .env.production; ENV_MODE=local (Ollama / local Jina)",
    )
    parser.add_argument("--verbose", action="store_true", help="Detailed logging")

    args = parser.parse_args()

    # Confirmation (run.ts sets PROD_CONFIRMED=1 after its prompt; CI may use CONFIRM_PROD_RUN=YES)
    if args.prod or args.publish:
        if sys.stdin.isatty() and os.environ.get("PROD_CONFIRMED") != "1":
            mode = "PRODUCTION (full)" if args.prod else "PRODUCTION DB (publish — local LLMs)"
            confirm = input(f"⚠️  RUNNING AGAINST {mode}. Type 'YES' to continue: ")
            if confirm != "YES":
                sys.exit(0)
        elif not sys.stdin.isatty() and os.environ.get("PROD_CONFIRMED") != "1":
            if os.environ.get("CONFIRM_PROD_RUN") != "YES":
                print(
                    "Refusing production run in non-interactive mode. "
                    "Set CONFIRM_PROD_RUN=YES (or run via npm run process:prod / process:publish).",
                    file=sys.stderr,
                )
                sys.exit(1)

    # Process jobs
    result = process_jobs_unified(
        task=args.task,
        limit=args.limit,
        job_ids=args.job_id,
        dry_run=args.dry_run,
        verbose=args.verbose,
        since_days=args.since_days,
        force_language_reprocess=args.force_language_reprocess
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
