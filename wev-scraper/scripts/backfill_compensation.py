"""Idempotent backfill script for structured compensation fields.

Processes all jobs rows where compensation_meta IS NULL by calling the LLM
extraction pipeline and updating the five structured compensation columns.

Usage:
    python scripts/backfill_compensation.py [--dry-run] [--batch-size=50]

Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path


from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

from utils.db import supabase
from lib.compensation import extract_and_guard

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

DEFAULT_BATCH_SIZE = 50


def _build_compensation_meta(extraction, wage: str | None) -> dict:
    """Build the compensation_meta JSONB dict from an extraction result."""
    meta: dict = {
        "confidence": extraction.confidence,
        "raw": wage or "",
        "currency": extraction.currency,
    }
    if extraction.raw_note is not None:
        meta["notes"] = extraction.raw_note
    return meta


def _would_violate_constraints(extraction) -> str | None:
    """Return a description of any constraint violation, or None if clean.

    Mirrors the five NOT VALID constraints added in the migration.
    """
    unit = extraction.unit_text
    min_v = extraction.min_value
    max_v = extraction.max_value
    hours = extraction.hours_per_week

    # compensation_unit_check
    valid_units = {"HOUR", "DAY", "WEEK", "MONTH", "YEAR"}
    if unit is not None and unit not in valid_units:
        return f"compensation_unit_check: invalid unit_text={unit!r}"

    # compensation_integrity_check
    if (unit is None) != (min_v is None):
        return f"compensation_integrity_check: unit_text and min_value must both be null or both non-null"
    if min_v is not None and min_v < 0:
        return f"compensation_integrity_check: min_value={min_v} < 0"

    # compensation_zero_salary_check
    if min_v is not None and min_v == 0:
        return f"compensation_zero_salary_check: min_value=0"

    # compensation_range_check
    if min_v is not None and max_v is not None and max_v < min_v:
        return f"compensation_range_check: max_value={max_v} < min_value={min_v}"

    # compensation_hours_check
    if hours is not None and not (1 <= hours <= 80):
        return f"compensation_hours_check: hours_per_week={hours} not in [1, 80]"

    return None


def run_backfill(batch_size: int = DEFAULT_BATCH_SIZE, dry_run: bool = False, batch_delay: float = 0.1) -> dict:
    """Run the idempotent compensation backfill.

    Selects rows where compensation_meta IS NULL in batches, calls
    extract_and_guard for each, and UPDATEs the structured columns.

    Args:
        batch_size: Number of rows to process per DB query (50–100 recommended).
        dry_run: If True, log what would happen but skip DB writes.
        batch_delay: Seconds to sleep between batches to avoid DB rate limits.

    Returns:
        Summary dict with counts: processed, skipped, errors, constraint_violations.
    """
    logger.info("Starting compensation backfill (batch_size=%d, dry_run=%s)", batch_size, dry_run)

    processed = 0
    skipped = 0
    errors = 0
    constraint_violations = 0
    offset = 0

    while True:
        # Idempotency: only select rows where compensation_meta IS NULL
        resp = (
            supabase.table("jobs")
            .select("id, wage")
            .is_("compensation_meta", "null")
            .order("id")
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        rows = resp.data or []

        if not rows:
            logger.info("No more unprocessed rows. Backfill complete.")
            break

        logger.info("Processing batch of %d rows (offset=%d)", len(rows), offset)

        for row in rows:
            job_id = row["id"]
            wage = row.get("wage")

            try:
                extraction = extract_and_guard(wage or "")
            except Exception as exc:
                logger.error("Extraction failed for id=%s: %s", job_id, exc)
                errors += 1
                # Still write a meta record so this row isn't retried endlessly
                if not dry_run:
                    supabase.table("jobs").update({
                        "compensation_meta": {
                            "confidence": 0.0,
                            "raw": wage or "",
                            "currency": None,
                            "notes": f"extraction_error: {exc}",
                        }
                    }).eq("id", job_id).execute()
                continue

            # Check for constraint violations before writing
            violation = _would_violate_constraints(extraction)
            if violation:
                logger.warning(
                    "Constraint violation for id=%s, skipping UPDATE: %s", job_id, violation
                )
                constraint_violations += 1
                if not dry_run:
                    supabase.table("jobs").update({
                        "compensation_meta": {
                            "confidence": extraction.confidence,
                            "raw": wage or "",
                            "currency": extraction.currency,
                            "notes": f"constraint_violation: {violation}",
                        }
                    }).eq("id", job_id).execute()
                skipped += 1
                continue

            meta = _build_compensation_meta(extraction, wage)

            logger.info(
                "id=%s wage=%r → unit=%s min=%s confidence=%.2f",
                job_id,
                wage,
                extraction.unit_text,
                extraction.min_value,
                extraction.confidence,
            )

            if not dry_run:
                supabase.table("jobs").update({
                    "unit_text": extraction.unit_text,
                    "min_value": extraction.min_value,
                    "max_value": extraction.max_value,
                    "hours_per_week": extraction.hours_per_week,
                    "compensation_meta": meta,
                }).eq("id", job_id).execute()

            processed += 1

        # If we got fewer rows than batch_size, we've reached the end
        if len(rows) < batch_size:
            break

        offset += batch_size
        if batch_delay > 0:
            time.sleep(batch_delay)

    summary = {
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
        "constraint_violations": constraint_violations,
        "dry_run": dry_run,
    }
    logger.info("Backfill summary: %s", json.dumps(summary))
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill structured compensation fields")
    parser.add_argument("--dry-run", action="store_true", help="Log actions without writing to DB")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Rows per batch (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--batch-delay",
        type=float,
        default=0.1,
        help="Seconds to sleep between batches (default: 0.1)",
    )
    args = parser.parse_args()

    if args.batch_size < 1 or args.batch_size > 100:
        print("--batch-size must be between 1 and 100")
        sys.exit(1)

    summary = run_backfill(batch_size=args.batch_size, dry_run=args.dry_run, batch_delay=args.batch_delay)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
