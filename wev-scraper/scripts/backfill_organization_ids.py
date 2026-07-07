"""Backfill script for organization_id resolution.

Resolves organization_id for all jobs where it is currently NULL and
the organization text field is non-empty. Uses OrganizationResolver
(cache → DB lookup → LLM → minimal fallback).

Usage:
    python scripts/backfill_organization_ids.py [options]

Options:
    --dry-run                 Log what would happen without writing to DB
    --env local|staging|prod  Target environment (default: local)
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

from utils.prod_env import resolve_prod_env_path

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
    last_id = "00000000-0000-0000-0000-000000000000"

    logger.info("Resolving organization_id for unlinked jobs…")

    while True:
        # Keyset pagination on immutable id — avoids skipping rows when
        # organization_id updates shift OFFSET-based windows.
        # Requirements: 6.2, 6.6
        resp = (
            supabase.table("jobs")
            .select("id, organization, municipality, province, location, job_title, description")
            .is_("organization_id", "null")
            .neq("organization", "")
            .order("id")
            .gt("id", last_id)
            .limit(batch_size)
            .execute()
        )
        rows = resp.data or []

        if not rows:
            logger.info("Phase 1: No more unresolved jobs. Done.")
            break

        logger.info(
            "Phase 1: Processing batch of %d jobs (starting after id=%s)", len(rows), last_id
        )

        for row in rows:
            job_id = row["id"]
            try:
                org_id = resolver.resolve(
                    raw_name=row.get("organization", ""),
                    municipality=row.get("municipality"),
                    province=row.get("province"),
                    location=row.get("location"),
                    job_title=row.get("job_title", ""),
                    description=row.get("description", ""),
                    job_id=job_id,
                )

                if org_id is not None:
                    logger.info("job_id=%s → organization_id=%s", job_id, org_id)

                    if not dry_run:
                        # NOTE: This performs N+1 sequential updates. While a bulk update
                        # would be faster, Supabase `upsert` requires all NOT NULL columns 
                        # to be present, and writing a custom RPC for a one-off backfill 
                        # script is overkill. Sequential updates are fine for this context.
                        supabase.table("jobs").update(
                            {"organization_id": org_id}
                        ).eq("id", job_id).execute()
                    resolved += 1
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

        last_id = rows[-1]["id"]

        if len(rows) < batch_size:
            break

        if batch_delay_seconds > 0:
            time.sleep(batch_delay_seconds)

    summary = {
        "phase1_processed": total_processed,
        "orgs_resolved": resolved,
        "unresolved": unresolved,
        "errors": errors,
        "dry_run": dry_run,
    }
    logger.info("Phase 1 summary: %s", json.dumps(summary))
    return summary


def run_sse_backfill(
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
    batch_delay_seconds: float = DEFAULT_BATCH_DELAY,
    dry_run: bool = False,
) -> dict:
    """Run Phase 2: SSE classification for unrated organizations.

    Fetches all organizations WHERE sse_rating IS NULL and classifies
    each against SSE criteria. Idempotent: orgs with existing sse_rating
    are never re-classified.

    Args:
        batch_size: Number of orgs to fetch per DB query.
        batch_delay_seconds: Seconds to sleep between batches.
        dry_run: If True, log actions without writing to DB.

    Returns:
        Summary dict with Phase 2 counts.

    Requirements: 5.5, 5.6
    """
    from utils.db import supabase
    from utils.organization_assessment import OrganizationAssessor
    from utils.organization_repository import OrganizationRepository

    logger.info(
        "Starting Phase 2 (org assessment backfill) — batch_size=%d, batch_delay=%.1fs, dry_run=%s",
        batch_size,
        batch_delay_seconds,
        dry_run,
    )

    try:
        assessor = OrganizationAssessor()
    except Exception as exc:
        logger.error("Phase 2: OrganizationAssessor unavailable: %s", exc)
        return {
            "phase2_classified": 0,
            "phase2_errors": 0,
            "phase2_skipped_no_classifier": True,
            "dry_run": dry_run,
        }

    repo = OrganizationRepository(supabase)

    total_classified = 0
    errors = 0
    last_id = 0

    while True:
        rows = repo.fetch_unrated_orgs(after_id=last_id, limit=batch_size)

        if not rows:
            logger.info("Phase 2: No more unrated orgs. Done.")
            break

        logger.info(
            "Phase 2: Processing batch of %d orgs (starting after id=%s)", len(rows), last_id,
        )

        for org_row in rows:
            org_id = org_row["id"]
            try:
                update = assessor.assess_and_build_update(org_row)
                if update is None:
                    logger.warning(
                        "Phase 2: assess_and_build_update returned None for org_id=%s (%s)",
                        org_id, org_row.get("name", "?"),
                    )
                    continue

                logger.info(
                    "Phase 2: org_id=%s (%s) → sse_rating=%s",
                    org_id, org_row.get("name", "?"), update.get("sse_rating"),
                )

                if not dry_run:
                    repo.update_org(org_id, **update)

                total_classified += 1

            except Exception as exc:
                # Per-org isolation: one failure does not abort the batch
                logger.error(
                    "Phase 2: Error classifying org_id=%s: %s", org_id, exc, exc_info=True,
                )
                errors += 1

        last_id = rows[-1]["id"]

        if len(rows) < batch_size:
            break

        if batch_delay_seconds > 0:
            time.sleep(batch_delay_seconds)

    summary = {
        "phase2_classified": total_classified,
        "phase2_errors": errors,
        "dry_run": dry_run,
    }
    logger.info("Phase 2 summary: %s", json.dumps(summary))
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

    args.batch_size = max(1, min(args.batch_size, MAX_BATCH_SIZE))

    if args.env in ("staging", "prod"):
        from pathlib import Path

        env_file_name = f".env.{args.env}"
        script_path = Path(__file__)
        env_path = resolve_prod_env_path(script_path).with_name(env_file_name)
        if env_path.exists():
            logger.info("Loading %s overrides from %s", args.env, env_path)
            load_dotenv(env_path, override=True)
        else:
            logger.warning("--env %s but %s not found", args.env, env_path)

    phase1_summary = run_backfill(
        batch_size=args.batch_size,
        batch_delay_seconds=args.batch_delay_seconds,
        dry_run=args.dry_run,
    )

    # Phase 2 runs only after Phase 1 fully completes (sequential)
    # Requirements: 5.6
    phase2_summary = run_sse_backfill(
        batch_size=args.batch_size,
        batch_delay_seconds=args.batch_delay_seconds,
        dry_run=args.dry_run,
    )

    combined = {**phase1_summary, **phase2_summary}
    print(json.dumps(combined, indent=2))

    total_errors = phase1_summary.get("errors", 0) + phase2_summary.get("phase2_errors", 0)
    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
