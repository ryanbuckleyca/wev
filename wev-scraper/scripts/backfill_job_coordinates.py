"""Backfill lat/lng/geocode_accuracy_type for existing jobs.

Queries all jobs rows where lat IS NULL and municipality or province is non-null,
then calls Geocodio to resolve coordinates and writes them back.

Usage:
    python scripts/backfill_job_coordinates.py [--batch-size 50] [--sleep-seconds 0]
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

# Ensure the scraper root is on sys.path when run directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from utils.db import supabase
from utils.location_parser import parse_address_with_geocodio

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

DEFAULT_BATCH_SIZE = 50
DEFAULT_SLEEP_SECONDS = 0.0


def _count_remaining() -> int:
    """Count total jobs where lat IS NULL and municipality or province is non-null."""
    resp = (
        supabase.table("jobs")
        .select("id", count="exact")
        .is_("lat", "null")
        .or_("municipality.not.is.null,province.not.is.null")
        .execute()
    )
    return resp.count or 0


def _fetch_batch(batch_size: int, offset: int) -> list[dict]:
    """Fetch a batch of jobs needing geocoding."""
    resp = (
        supabase.table("jobs")
        .select("id, location, municipality, province")
        .is_("lat", "null")
        .or_("municipality.not.is.null,province.not.is.null")
        .order("id")
        .range(offset, offset + batch_size - 1)
        .execute()
    )
    return resp.data or []


def _build_location_string(row: dict) -> str | None:
    """Build a location string from a job row for geocoding."""
    location = (row.get("location") or "").strip()
    if location:
        return location
    # Fall back to constructing from municipality/province
    parts = [p for p in [row.get("municipality"), row.get("province")] if p]
    return ", ".join(parts) if parts else None


def run_backfill(batch_size: int = DEFAULT_BATCH_SIZE, sleep_seconds: float = DEFAULT_SLEEP_SECONDS) -> dict:
    """Run the coordinate backfill.

    Args:
        batch_size: Number of rows to process per DB query.
        sleep_seconds: Additional seconds to sleep after each Geocodio request
                       (parse_address_with_geocodio already sleeps 1s internally).

    Returns:
        Summary dict with counts: geocoded, skipped, errors.
    """
    total = _count_remaining()
    logger.info("Starting coordinate backfill: %d jobs to process (batch_size=%d, sleep_seconds=%.1f)",
                total, batch_size, sleep_seconds)

    geocoded = 0
    skipped = 0
    errors = 0
    offset = 0
    batch_num = 0

    while True:
        rows = _fetch_batch(batch_size, offset)
        if not rows:
            logger.info("No more rows to process. Backfill complete.")
            break

        batch_num += 1
        logger.info("Batch %d: processing %d rows (offset=%d)", batch_num, len(rows), offset)

        for row in rows:
            job_id = row["id"]
            municipality = row.get("municipality")
            province = row.get("province")

            # Skip jobs with neither municipality nor province
            if not municipality and not province:
                logger.warning("Skipping job id=%s: no municipality or province", job_id)
                skipped += 1
                continue

            location_str = _build_location_string(row)
            if not location_str:
                logger.warning("Skipping job id=%s: could not build location string", job_id)
                skipped += 1
                continue

            try:
                result = parse_address_with_geocodio(location_str)
            except Exception as exc:
                logger.error("Geocodio error for job id=%s location=%r: %s", job_id, location_str, exc)
                errors += 1
                if sleep_seconds > 0:
                    time.sleep(sleep_seconds)
                continue

            lat = result.get("lat")
            lng = result.get("lng")
            accuracy_type = result.get("geocode_accuracy_type")

            if lat is None or lng is None:
                logger.warning("No coordinates returned for job id=%s location=%r", job_id, location_str)
                errors += 1
                if sleep_seconds > 0:
                    time.sleep(sleep_seconds)
                continue

            try:
                supabase.table("jobs").update({
                    "lat": lat,
                    "lng": lng,
                    "geocode_accuracy_type": accuracy_type,
                }).eq("id", job_id).execute()
                geocoded += 1
                logger.debug("Updated job id=%s: lat=%s, lng=%s, accuracy=%s", job_id, lat, lng, accuracy_type)
            except Exception as exc:
                logger.error("DB update failed for job id=%s: %s", job_id, exc)
                errors += 1

            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

        # Log progress after each batch
        done_so_far = geocoded + skipped + errors
        if total > 0 and done_so_far > 0:
            # Estimate remaining time based on per-request cost (1s internal + sleep_seconds)
            seconds_per_job = 1.0 + sleep_seconds
            remaining_jobs = total - done_so_far
            remaining_seconds = remaining_jobs * seconds_per_job
            remaining_minutes = remaining_seconds / 60
            logger.info(
                "%d/%d jobs geocoded, ~%.0f minutes remaining",
                geocoded, total, remaining_minutes,
            )

        if len(rows) < batch_size:
            break

        offset += batch_size

    summary = {
        "geocoded": geocoded,
        "skipped": skipped,
        "errors": errors,
        "total_queried": total,
    }
    logger.info("Backfill complete: %s", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill lat/lng coordinates for existing jobs")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Rows per batch (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=DEFAULT_SLEEP_SECONDS,
        help=f"Additional sleep between each Geocodio request in seconds (default: {DEFAULT_SLEEP_SECONDS}). "
             "Note: parse_address_with_geocodio already enforces 1s internally.",
    )
    args = parser.parse_args()

    if args.batch_size < 1:
        print("--batch-size must be at least 1")
        sys.exit(1)
    if args.sleep_seconds < 0:
        print("--sleep-seconds must be >= 0")
        sys.exit(1)

    run_backfill(batch_size=args.batch_size, sleep_seconds=args.sleep_seconds)


if __name__ == "__main__":
    main()
