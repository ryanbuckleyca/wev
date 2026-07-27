#!/usr/bin/env python
"""Backfill organizations.municipality and organizations.province only.

Does not write lat/lng/geocode_accuracy_type or any other org fields.
Only fills fields that are currently null/empty — never overwrites existing values.

Targets orgs that have a non-empty location string and are missing municipality
and/or province (including rows that already have municipality but province is
null — the common case that leaves org index filters empty).

Usage:
    # Dry-run (local / test DB)
    python scripts/backfill_org_coordinates.py --dry-run --limit 10

    # Prod dry-run
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_coordinates.py \\
        --prod --dry-run --limit 10

    # Prod apply (all needing fill)
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_coordinates.py --prod
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

from utils.prod_env import bootstrap_prod_from_argv, confirm_prod_run

if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    bootstrap_prod_from_argv(sys.argv[1:], Path(__file__))
    print("Using PRODUCTION database")
else:
    print("Using TEST database")

from utils.db import PAGE_SIZE, supabase  # noqa: E402
from utils.location_parser import (  # noqa: E402
    _extract_explicit_location,
    _normalize_ca_province_code,
    parse_address_with_geocodio,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

_RATE_LIMIT_SLEEP = 1  # seconds between geocode requests


def _missing(value: str | None) -> bool:
    return not (value or "").strip()


def _fetch_orgs_needing_fill() -> list[dict]:
    """Orgs with location that still need municipality and/or province."""
    rows: list[dict] = []
    offset = 0
    while True:
        resp = (
            supabase.table("organizations")
            .select("id, location, municipality, province")
            .not_.is_("location", "null")
            .neq("location", "")
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        for org in batch:
            if _missing(org.get("location")):
                continue
            if _missing(org.get("municipality")) or _missing(org.get("province")):
                rows.append(org)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def _enrich_from_location_string(location: str, geo: dict) -> dict:
    """Fill gaps using explicit City, Province text when Geocodio omits a field."""
    if geo.get("municipality") and geo.get("province"):
        return geo
    explicit = _extract_explicit_location(location)
    if not explicit or "," not in explicit:
        return geo
    city, _, rest = explicit.partition(",")
    city = city.strip() or None
    province = _normalize_ca_province_code(rest.strip())
    out = dict(geo)
    if not out.get("municipality") and city:
        out["municipality"] = city
    if not out.get("province") and province:
        out["province"] = province
    return out


def _build_payload(org: dict, geo_data: dict) -> dict:
    """Only municipality/province, and only for fields that are currently empty."""
    geo = dict(geo_data)
    if geo.get("province"):
        geo["province"] = _normalize_ca_province_code(geo["province"]) or geo["province"]

    geo = _enrich_from_location_string(org.get("location") or "", geo)

    payload: dict = {}
    if _missing(org.get("municipality")) and geo.get("municipality"):
        payload["municipality"] = geo["municipality"]
    if _missing(org.get("province")) and geo.get("province"):
        payload["province"] = geo["province"]
    return payload


def _update_org(org_id: int, payload: dict, *, dry_run: bool) -> bool:
    if dry_run:
        logger.info("  [dry-run] would update org_id=%s with %s", org_id, payload)
        return True

    result = supabase.table("organizations").update(payload).eq("id", org_id).execute()
    if result.data:
        return True

    logger.warning("  -> Update returned no data for org_id=%s (possible RLS or error)", org_id)
    return False


def backfill_org_municipality_province(
    *,
    dry_run: bool = False,
    limit: int | None = None,
) -> None:
    logger.info("Fetching organizations missing municipality and/or province...")
    orgs_to_update = _fetch_orgs_needing_fill()

    if not orgs_to_update:
        logger.info("No organizations need municipality/province backfill.")
        return

    if limit is not None:
        orgs_to_update = orgs_to_update[:limit]

    logger.info(
        "Found %d organization(s) to fill%s%s.",
        len(orgs_to_update),
        " (dry-run)" if dry_run else "",
        f" (limit={limit})" if limit is not None else "",
    )

    updates = 0
    skipped = 0

    for org in orgs_to_update:
        org_id = org["id"]
        location_str = org["location"]

        logger.info(
            "Geocoding org_id=%s location=%r (mun=%r prov=%r)...",
            org_id,
            location_str,
            org.get("municipality"),
            org.get("province"),
        )
        geo_data = parse_address_with_geocodio(location_str)
        payload = _build_payload(org, geo_data)

        if not payload:
            skipped += 1
            logger.info("  -> No new municipality/province to write, skipping.")
        elif _update_org(org_id, payload, dry_run=dry_run):
            updates += 1
            logger.info(
                "  -> %s %s",
                "would update" if dry_run else "updated",
                payload,
            )
        else:
            skipped += 1

        time.sleep(_RATE_LIMIT_SLEEP)

    logger.info(
        "Done. %d updated, %d skipped%s.",
        updates,
        skipped,
        " (dry-run — no writes made)" if dry_run else "",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Use production database (.env.production)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print changes without writing to the database",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process at most N organizations",
    )
    args = parser.parse_args()

    backfill_org_municipality_province(dry_run=args.dry_run, limit=args.limit)
