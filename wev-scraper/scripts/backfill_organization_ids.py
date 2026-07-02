"""Backfill script for organization_id resolution.

Resolves organization_id for all jobs where it is currently NULL and
the organization text field is non-empty. Uses OrganizationResolver
(cache → DB lookup → LLM → minimal fallback).

Usage:
    python scripts/backfill_organization_ids.py [options]

Options:
    --dry-run                 Log what would happen without writing to DB
    --env local|staging       Target environment (default: local)
    --batch-size N            Jobs per batch (default: 50)
    --batch-delay-seconds N   Seconds between batches (default: 2)

Requirements: 6.1–6.8, 5.6
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time

from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

DEFAULT_BATCH_SIZE = 50
DEFAULT_BATCH_DELAY = 2.0
MAX_BATCH_SIZE = 500  # Supabase range() limit is 1000; 500 is a safe ceiling


def run_backfill(
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
    batch_delay_seconds: float = DEFAULT_BATCH_DELAY,
    dry_run: bool = False,
) -> dict:
    """Run org resolution backfill.

    Args:
        batch_size: Number of jobs to fetch per DB query.
        batch_delay_seconds: Seconds to sleep between batches.
        dry_run: If True, log actions without writing to DB.

    Returns:
        Summary dict with counts.

    Requirements: 6.1–6.8
    """
    from utils.db import supabase
    from utils.organization_resolver import create_resolver

    logger.info(
        "Starting org backfill — batch_size=%d, batch_delay=%.1fs, dry_run=%s",
        batch_size,
        batch_delay_seconds,
        dry_run,
    )

    resolver = create_resolver()

    total_processed = 0
    errors = 0
    resolved = 0
    unresolved = 0
    offset = 0

    logger.info("Resolving organization_id for unlinked jobs…")

    while True:
        # Idempotency: only jobs with organization_id IS NULL and org text non-empty
        # Requirements: 6.2, 6.6
        resp = (
            supabase.table("jobs")
            .select("id, organization, municipality, province, location, job_title, description")
            .is_("organization_id", "null")
            .neq("organization", "")
            .order("id")
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        rows = resp.data or []

        if not rows:
            logger.info("Phase 1: No more unresolved jobs. Done.")
            break

        logger.info(
            "Phase 1: Processing batch of %d jobs (offset=%d)", len(rows), offset
        )

        for row in rows:
            job_id = row["id"]
            try:
                org_id = resolver.resolve(
                    raw_name=row.get("organization", ""),
                    municipality=row.get("municipality"),
                    province=row.get("province"),
                    job_title=row.get("job_title", ""),
                    description=row.get("description", ""),
                    job_id=job_id,
                )

                if org_id is not None:
                    logger.info("job_id=%s → organization_id=%s", job_id, org_id)
                    resolved += 1

                    if not dry_run:
                        supabase.table("jobs").update(
                            {"organization_id": org_id}
                        ).eq("id", job_id).execute()
                else:
                    unresolved += 1
                    logger.warning(
                        "Phase 1: Could not resolve organization for job_id=%s org=%r",
                        job_id,
                        row.get("organization"),
                    )

                total_processed += 1

            except Exception as exc:
                # Per-job isolation: one failure does not abort the batch
                # Requirements: 6.3
                logger.error(
                    "Phase 1: Error processing job_id=%s: %s", job_id, exc, exc_info=True
                )
                errors += 1

        if len(rows) < batch_size:
            break

        offset += batch_size

        if batch_delay_seconds > 0:
            time.sleep(batch_delay_seconds)

    summary = {
        "phase1_processed": total_processed,
        "orgs_resolved": resolved,
        "unresolved": unresolved,
        "errors": errors,
        "dry_run": dry_run,
    }
    logger.info("Backfill summary: %s", json.dumps(summary))
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill organization_id for existing jobs"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log actions without writing to DB",
    )
    parser.add_argument(
        "--env",
        choices=["local", "staging", "prod"],
        default="local",
        help="Target environment (default: local)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Jobs per batch (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--batch-delay-seconds",
        type=float,
        default=DEFAULT_BATCH_DELAY,
        help=f"Seconds between batches (default: {DEFAULT_BATCH_DELAY})",
    )
    args = parser.parse_args()

    if not (1 <= args.batch_size <= MAX_BATCH_SIZE):
        print(f"--batch-size must be between 1 and {MAX_BATCH_SIZE}", file=sys.stderr)
        sys.exit(1)

    if args.env in ("staging", "prod"):
        from pathlib import Path

        env_file_name = f".env.{args.env}"
        env_path = Path(__file__).resolve().parent.parent.parent / env_file_name
        if env_path.exists():
            logger.info("Loading %s overrides from %s", args.env, env_path)
            load_dotenv(env_path, override=True)
        else:
            logger.warning("--env %s but %s not found", args.env, env_path)

    summary = run_backfill(
        batch_size=args.batch_size,
        batch_delay_seconds=args.batch_delay_seconds,
        dry_run=args.dry_run,
    )
    print(json.dumps(summary, indent=2))

    if summary["errors"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
