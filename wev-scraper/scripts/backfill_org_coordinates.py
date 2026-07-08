"""Backfill municipality/province/lat/lng for organizations that have a location string
but are missing structured geocode data.

Usage:
    # Dry run (print what would be updated, no writes):
    .venv/bin/python scripts/backfill_org_coordinates.py --dry-run

    # Live run, all orgs:
    .venv/bin/python scripts/backfill_org_coordinates.py

    # Live run, limit to first N orgs (useful for testing):
    .venv/bin/python scripts/backfill_org_coordinates.py --limit 10
"""

import argparse
import logging
import time

from utils.db import supabase
from utils.location_parser import parse_address_with_geocodio

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

_RATE_LIMIT_SLEEP = 1  # seconds between geocode requests


def _fetch_orgs_needing_geocode() -> list[dict]:
    response = supabase.table("organizations").select("id, location, municipality, province").execute()
    orgs = response.data or []
    return [o for o in orgs if o.get("location") and not o.get("municipality") and not o.get("province")]


def _update_org_coordinates(org_id: int, geo_data: dict, dry_run: bool) -> bool:
    """Apply geocode fields to the given org. Returns True on success."""
    payload = {
        "municipality": geo_data.get("municipality"),
        "province": geo_data.get("province"),
        "lat": geo_data.get("lat"),
        "lng": geo_data.get("lng"),
        "geocode_accuracy_type": geo_data.get("geocode_accuracy_type"),
    }
    if dry_run:
        logger.info("  [dry-run] would update org_id=%s with %s", org_id, payload)
        return True

    result = supabase.table("organizations").update(payload).eq("id", org_id).execute()
    if result.data:
        return True

    logger.warning("  -> Update returned no data for org_id=%s (possible RLS or error)", org_id)
    return False


def backfill_org_coordinates(dry_run: bool = False, limit: int | None = None) -> None:
    logger.info("Fetching organizations with missing location coordinates...")
    orgs_to_update = _fetch_orgs_needing_geocode()

    if not orgs_to_update:
        logger.info("No organizations need geocoding.")
        return

    if limit is not None:
        orgs_to_update = orgs_to_update[:limit]

    logger.info(
        "Found %d organization(s) to geocode%s%s.",
        len(orgs_to_update),
        " (dry-run)" if dry_run else "",
        f" (limit={limit})" if limit is not None else "",
    )

    updates = 0
    skipped = 0

    for org in orgs_to_update:
        org_id = org["id"]
        location_str = org["location"]

        logger.info("Geocoding org_id=%s, location='%s'...", org_id, location_str)
        geo_data = parse_address_with_geocodio(location_str)

        if geo_data.get("municipality") or geo_data.get("province"):
            success = _update_org_coordinates(org_id, geo_data, dry_run)
            if success:
                updates += 1
                logger.info(
                    "  -> %s: %s, %s",
                    "would update" if dry_run else "updated",
                    geo_data.get("municipality"),
                    geo_data.get("province"),
                )
            else:
                skipped += 1
        else:
            skipped += 1
            logger.info("  -> No structured location found, skipping.")

        time.sleep(_RATE_LIMIT_SLEEP)

    logger.info(
        "Done. %d updated, %d skipped%s.",
        updates,
        skipped,
        " (dry-run — no writes made)" if dry_run else "",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing to the database")
    parser.add_argument("--limit", type=int, default=None, metavar="N", help="Process at most N organizations")
    args = parser.parse_args()

    backfill_org_coordinates(dry_run=args.dry_run, limit=args.limit)
