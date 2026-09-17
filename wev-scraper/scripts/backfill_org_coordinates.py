#!/usr/bin/env python
r"""Re-geocode organizations with incomplete geo fields and rewrite the geo set.

For orgs with a non-empty ``location`` missing any of municipality / province /
lat / lng / geocode_accuracy_type, re-query Geocodio and rewrite resolved fields.
Never clears an existing value with null when Geocodio fails.

Orgs that still lack municipality/province after Geocodio (e.g. remote-only
location strings) can be re-assessed with ``--reassess`` (Tavily-grounded HQ).

Usage:
    # Dry-run (local / test DB)
    python scripts/backfill_org_coordinates.py --dry-run --limit 10

    # Prod dry-run
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_coordinates.py \\
        --prod --dry-run --limit 10

    # Prod rewrite all incomplete geo from location
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_coordinates.py --prod

    # After geocode, re-assess remaining HQ-less orgs via Tavily
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_coordinates.py \\
        --prod --reassess
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
    geo_row_needs_city_geocode,
    is_province_like_municipality,
    parse_address_with_geocodio,
)
from utils.municipality_canonical import canonicalize_municipality  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

_GEO_KEYS = ("municipality", "province", "lat", "lng", "geocode_accuracy_type")


def _missing(value) -> bool:
    return value is None or (isinstance(value, str) and not str(value).strip())


def _row_incomplete(row: dict) -> bool:
    """True when city-level geocode fields are still missing.

    Province-only / remote-only / country-only locations are not incomplete
    just because municipality is null.
    """
    return geo_row_needs_city_geocode(row)


def _fetch_orgs_needing_geocode(limit: int | None = None) -> list[dict]:
    """Orgs with location that still need any geo field."""
    rows: list[dict] = []
    offset = 0
    cols = "id,name,location,municipality,province,lat,lng,geocode_accuracy_type,website,description_en,description"
    while True:
        resp = (
            supabase.table("organizations")
            .select(cols)
            .not_.is_("location", "null")
            .neq("location", "")
            .or_(
                "municipality.is.null,municipality.eq.,"
                "province.is.null,province.eq.,"
                "lat.is.null,lng.is.null,geocode_accuracy_type.is.null"
            )
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
            if _row_incomplete(org):
                rows.append(org)
                if limit is not None and len(rows) >= limit:
                    return rows
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def _enrich_from_location_string(location: str, geo: dict) -> dict:
    """Fill gaps using explicit City, Province text when Geocodio omits a field.

    Only runs after a successful Geocodio hit. Never invents a city from regex
    alone when Geocodio returned nothing.
    """
    if not any(
        [
            geo.get("municipality"),
            geo.get("province"),
            geo.get("lat") is not None,
            geo.get("lng") is not None,
            geo.get("geocode_accuracy_type"),
        ]
    ):
        return geo
    if geo.get("municipality") and geo.get("province"):
        return geo
    explicit = _extract_explicit_location(location)
    if not explicit or "," not in explicit:
        return geo
    city, _, rest = explicit.partition(",")
    city = city.strip() or None
    if city and ("." in city or ";" in city or len(city.split()) > 3):
        city = None
    province = _normalize_ca_province_code(rest.strip())
    out = dict(geo)
    if not out.get("municipality") and city and not is_province_like_municipality(city):
        out["municipality"] = city
    if not out.get("province") and province:
        out["province"] = province
    return out


def _build_rewrite_payload(org: dict, geo_data: dict, *, rewrite: bool) -> dict:
    """Rewrite (or fill) geo fields from Geocodio; never write null over existing."""
    geo = dict(geo_data)
    if geo.get("province"):
        geo["province"] = _normalize_ca_province_code(geo["province"]) or geo["province"]
    geo = _enrich_from_location_string(org.get("location") or "", geo)

    muni = canonicalize_municipality(geo.get("municipality"), geo.get("province"))
    if muni and is_province_like_municipality(muni):
        muni = None
    prov = geo.get("province")
    lat, lng = geo.get("lat"), geo.get("lng")
    acc = geo.get("geocode_accuracy_type")

    def _want(field: str) -> bool:
        return rewrite or _missing(org.get(field))

    payload: dict = {}
    if muni and _want("municipality"):
        payload["municipality"] = muni
    if prov and _want("province"):
        payload["province"] = prov
    if lat is not None and lng is not None and (_want("lat") or _want("lng")):
        payload["lat"] = lat
        payload["lng"] = lng
    if acc and _want("geocode_accuracy_type"):
        payload["geocode_accuracy_type"] = acc

    # Do not rewrite organizations.location — (name, location) has a unique
    # identity index, so normalizing "Montreal" → "Montreal, QC" can collide
    # with an existing row.
    return {k: v for k, v in payload.items() if org.get(k) != v}


def _update_org(org_id: int, payload: dict, *, dry_run: bool) -> bool:
    if dry_run:
        logger.info("  [dry-run] would update org_id=%s with %s", org_id, payload)
        return True

    try:
        result = (
            supabase.table("organizations").update(payload).eq("id", org_id).execute()
        )
    except Exception as e:
        # Unique (name, location) collisions if a caller still passes location.
        logger.error("  -> DB update failed org_id=%s: %s", org_id, e)
        return False
    if result.data:
        return True

    logger.warning("  -> Update returned no data for org_id=%s (possible RLS or race)", org_id)
    return False


def backfill_org_geocode(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    rewrite: bool = False,
) -> dict:
    logger.info("Fetching organizations with incomplete geo fields...")
    orgs = _fetch_orgs_needing_geocode(limit)

    if not orgs:
        logger.info("No organizations need geocode backfill.")
        return {"examined": 0, "updated": 0, "skipped": 0, "errors": 0}

    logger.info(
        "Found %d organization(s) to %s%s.",
        len(orgs),
        "rewrite" if rewrite else "fill",
        " (dry-run)" if dry_run else "",
    )

    updates = 0
    skipped = 0
    errors = 0

    for org in orgs:
        org_id = org["id"]
        location_str = org["location"]

        logger.info(
            "Geocoding org_id=%s name=%r location=%r (mun=%r prov=%r lat=%s)...",
            org_id,
            org.get("name"),
            location_str,
            org.get("municipality"),
            org.get("province"),
            org.get("lat"),
        )
        try:
            geo_data = parse_address_with_geocodio(location_str)
            payload = _build_rewrite_payload(org, geo_data, rewrite=rewrite)
        except Exception as e:
            logger.error("  -> Geocodio failed: %s", e)
            errors += 1
            continue

        if not payload:
            skipped += 1
            logger.info("  -> No geo fields to write, skipping.")
        elif _update_org(org_id, payload, dry_run=dry_run):
            updates += 1
            logger.info(
                "  -> %s %s",
                "would update" if dry_run else "updated",
                payload,
            )
        else:
            errors += 1

    summary = {
        "examined": len(orgs),
        "updated": updates,
        "skipped": skipped,
        "errors": errors,
        "dry_run": dry_run,
        "rewrite": rewrite,
    }
    logger.info("Geocode pass done: %s", summary)
    return summary


def reassess_orgs_missing_hq(*, dry_run: bool = False, limit: int | None = None) -> dict:
    """Tavily-grounded re-assessment for orgs still missing municipality/province."""
    from llm.tavily_grounding import is_tavily_available
    from utils.organization_assessment import OrganizationAssessor

    if not is_tavily_available():
        logger.error("Tavily not available — skipping --reassess")
        return {"examined": 0, "updated": 0, "skipped": 0, "errors": 1}

    assessor = OrganizationAssessor()

    rows: list[dict] = []
    offset = 0
    cols = (
        "id,name,location,municipality,province,lat,lng,geocode_accuracy_type,"
        "website,description_en,description"
    )
    while True:
        resp = (
            supabase.table("organizations")
            .select(cols)
            .or_("municipality.is.null,municipality.eq.,province.is.null,province.eq.")
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        for org in batch:
            if _missing(org.get("municipality")) or _missing(org.get("province")):
                rows.append(org)
                if limit is not None and len(rows) >= limit:
                    batch = []
                    break
        if len(batch) < PAGE_SIZE or (limit is not None and len(rows) >= limit):
            break
        offset += PAGE_SIZE

    logger.info("Re-assessing %d org(s) still missing HQ...", len(rows))
    updated = 0
    skipped = 0
    errors = 0

    for i, org in enumerate(rows, 1):
        name = org.get("name") or "(unnamed)"
        website = org.get("website")
        existing_description = org.get("description_en") or org.get("description")
        logger.info("[%d/%d] Assessing %s (website=%s)", i, len(rows), name, website)

        try:
            result = assessor.assess(
                raw_name=name,
                municipality=None,
                province=None,
                job_title="",
                description="",
                known_website=website,
                existing_description=existing_description,
            )
        except Exception as e:
            logger.error("  Assessment error: %s", e)
            errors += 1
            continue

        if not result:
            skipped += 1
            logger.info("  Assessment returned nothing")
            continue

        llm_mun = result.get("headquarters_municipality")
        llm_prov = result.get("headquarters_province")
        loc_str = (org.get("location") or "").strip()
        geo_data: dict = {}
        if llm_mun:
            hq_loc = ", ".join(part for part in (llm_mun, llm_prov) if part)
            geo_data = parse_address_with_geocodio(hq_loc)
        elif llm_prov and loc_str:
            geo_data = parse_address_with_geocodio(loc_str)
        elif not llm_prov:
            skipped += 1
            logger.info("  No HQ from assessment")
            continue

        municipality = geo_data.get("municipality") or llm_mun
        province = geo_data.get("province") or llm_prov
        # Seed geo dict so rewrite builder can use LLM + geocode together.
        seeded = {
            "municipality": municipality,
            "province": province,
            "lat": geo_data.get("lat"),
            "lng": geo_data.get("lng"),
            "geocode_accuracy_type": geo_data.get("geocode_accuracy_type"),
        }
        payload = _build_rewrite_payload(org, seeded, rewrite=True)
        if not payload:
            skipped += 1
            logger.info("  No fields to write after assessment")
            continue

        if _update_org(org["id"], payload, dry_run=dry_run):
            updated += 1
            logger.info("  %s %s", "would update" if dry_run else "updated", payload)
        else:
            errors += 1
        time.sleep(0.5)

    summary = {
        "examined": len(rows),
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "dry_run": dry_run,
    }
    logger.info("Reassess pass done: %s", summary)
    return summary


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
    parser.add_argument(
        "--rewrite",
        action="store_true",
        help="Overwrite existing geo fields (default: fill nulls only)",
    )
    parser.add_argument(
        "--fill-only",
        action="store_true",
        help="Deprecated: fill-nulls is already the default",
    )
    parser.add_argument(
        "--reassess",
        action="store_true",
        help="After geocode pass, Tavily-reassess orgs still missing HQ",
    )
    parser.add_argument(
        "--reassess-only",
        action="store_true",
        help="Skip geocode pass; only run Tavily reassess",
    )
    args = parser.parse_args()

    rewrite = bool(args.rewrite) and not args.fill_only

    if not args.reassess_only:
        backfill_org_geocode(
            dry_run=args.dry_run,
            limit=args.limit,
            rewrite=rewrite,
        )
    if args.reassess or args.reassess_only:
        reassess_orgs_missing_hq(dry_run=args.dry_run, limit=args.limit)
