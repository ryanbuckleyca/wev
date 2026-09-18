#!/usr/bin/env python
"""Re-geocode jobs with incomplete Geocodio fields and rewrite the geo set.

Typical reason data is missing: older runs used ``SHOULD_GEOCODE=0``, or Geocodio
returned municipality without province (``state`` vs ``state_province`` bug).

For every job that has a non-empty ``location`` (or a description we can infer
from) and is missing any of lat/lng/municipality/province/geocode_accuracy_type,
re-query Geocodio and **rewrite** resolved fields. Never clears an existing
value with null when Geocodio fails to resolve a field.

Usage:
    python -m scripts.backfill_missing_geocode_fields [--dry-run] [--prod] [--limit N]
    python -m scripts.backfill_missing_geocode_fields --prod --rewrite

    --prod              Load ``.env.production`` (requires ``CONFIRM_PROD_RUN=YES``).
    --dry-run           Log intended updates without writing.
    --limit             Max jobs to consider (default: no cap).
    --rewrite           Overwrite existing municipality/province/lat/lng/accuracy.
    --rewrite-location  Also rewrite jobs.location (destructive; off by default).
    --fill-only         Deprecated alias for default fill-nulls behaviour.
    --no-infer          Skip description-based inference for blank-location jobs.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from utils.prod_env import bootstrap_prod_from_argv, confirm_prod_run

if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    bootstrap_prod_from_argv(sys.argv[1:], Path(__file__))
    print("Using PRODUCTION database")
else:
    print("Using TEST database")

from utils.db import supabase  # noqa: E402
from utils.location_parser import (  # noqa: E402
    _extract_explicit_location,
    _normalize_ca_province_code,
    geo_row_needs_city_geocode,
    infer_location_string_from_text,
    is_province_like_municipality,
    parse_address_with_geocodio,
)
from utils.municipality_canonical import canonicalize_municipality  # noqa: E402

_GEO_KEYS = ("municipality", "province", "lat", "lng", "geocode_accuracy_type")


def _is_empty(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def _row_incomplete(row: dict) -> bool:
    """True when city-level geocode fields are still missing.

    Province-only / remote-only / country-only locations are not incomplete
    just because municipality is null.
    """
    return geo_row_needs_city_geocode(row)


def _enrich_from_location_string(location: str, geo: dict) -> dict:
    """Fill gaps using explicit City, Province text when Geocodio omits a field.

    Only runs after a successful Geocodio hit (some field already set). Never
    invents a municipality when Geocodio returned nothing — regex alone is too
    loose for that.
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
    # Reject sentence fragments that slipped past the extractor.
    if city and ("." in city or ";" in city or len(city.split()) > 3):
        city = None
    province = _normalize_ca_province_code(rest.strip())
    out = dict(geo)
    if not out.get("municipality") and city and not is_province_like_municipality(city):
        out["municipality"] = city
    if not out.get("province") and province:
        out["province"] = province
    return out


def _build_updates(
    row: dict,
    parsed: dict,
    *,
    rewrite: bool,
    rewrite_location: bool = False,
) -> dict:
    """Build DB update from Geocodio result.

    rewrite=True: write every resolved field (re-assess incomplete rows).
    rewrite=False: only fill fields that are currently empty.
    Never overwrite with null. Never rewrite ``location`` unless
    ``rewrite_location`` is set — the posting string is the recovery source.
    """
    updates: dict = {}
    lat, lng = parsed.get("lat"), parsed.get("lng")
    acc = parsed.get("geocode_accuracy_type")
    muni = canonicalize_municipality(parsed.get("municipality"), parsed.get("province"))
    prov = parsed.get("province")
    if prov:
        prov = _normalize_ca_province_code(prov) or prov

    def _want(field: str) -> bool:
        return rewrite or _is_empty(row.get(field))

    if lat is not None and lng is not None and (
        _want("lat") or _want("lng")
    ):
        updates["lat"] = lat
        updates["lng"] = lng
    if acc and _want("geocode_accuracy_type"):
        updates["geocode_accuracy_type"] = acc
    if muni and _want("municipality"):
        updates["municipality"] = muni
    if prov and _want("province"):
        updates["province"] = prov

    if rewrite_location:
        final_muni = updates.get("municipality") or row.get("municipality")
        final_prov = updates.get("province") or row.get("province")
        if final_muni and final_prov:
            display = f"{final_muni}, {final_prov}"
            if (row.get("location") or "").strip() != display:
                updates["location"] = display

    # Drop no-ops (same value already stored).
    return {
        k: v
        for k, v in updates.items()
        if row.get(k) != v
    }


def _fetch_jobs(*, limit: int | None, include_blank_location: bool) -> list[dict]:
    """Jobs with incomplete geo: prefer those with location; optionally blank-location."""
    cols = (
        "id,location,description,municipality,province,lat,lng,geocode_accuracy_type"
    )
    geo_keys = ("municipality", "province", "lat", "lng", "geocode_accuracy_type")
    rows: list[dict] = []
    page = 500
    offset = 0
    while True:
        if limit is not None and len(rows) >= limit:
            break
        q = (
            supabase.table("jobs")
            .select(cols)
            .or_(
                "lat.is.null,lng.is.null,municipality.is.null,"
                "province.is.null,geocode_accuracy_type.is.null",
            )
            .order("id")
            .range(offset, offset + page - 1)
        )
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            has_loc = not _is_empty(row.get("location"))
            if not has_loc:
                # geo_row_needs_city_geocode treats blank location as complete;
                # still select them when inference is enabled and geo is empty.
                if not include_blank_location:
                    continue
                if not any(_is_empty(row.get(k)) for k in geo_keys):
                    continue
                rows.append(row)
            elif _row_incomplete(row):
                rows.append(row)
            else:
                continue
            if limit is not None and len(rows) >= limit:
                return rows
        if len(batch) < page:
            break
        offset += page
    return rows


def run_backfill(
    *,
    dry_run: bool,
    limit: int | None,
    rewrite: bool = False,
    rewrite_location: bool = False,
    infer_blank: bool = True,
) -> dict:
    jobs = _fetch_jobs(limit=limit, include_blank_location=infer_blank)
    examined = 0
    updated = 0
    skipped_no_location = 0
    skipped_no_change = 0
    skipped_no_geocode_result = 0
    inferred = 0
    errors = 0

    print(
        f"Candidates: {len(jobs)} (rewrite={rewrite}, "
        f"rewrite_location={rewrite_location}, infer_blank={infer_blank})"
    )

    for row in jobs:
        examined += 1
        loc = (row.get("location") or "").strip()
        if not loc and infer_blank:
            loc = infer_location_string_from_text(row.get("description")) or ""
            if loc:
                inferred += 1
                print(f"  inferred job {row['id']}: {loc!r}")
        if not loc:
            skipped_no_location += 1
            continue

        try:
            parsed = parse_address_with_geocodio(loc)
            parsed = _enrich_from_location_string(loc, parsed)
        except Exception as e:
            print(f"✗ Geocodio exception job {row['id']}: {e}", file=sys.stderr)
            errors += 1
            continue

        updates = _build_updates(
            row,
            parsed,
            rewrite=rewrite,
            rewrite_location=rewrite_location,
        )
        if not updates:
            parsed_any = any(
                [
                    parsed.get("lat") is not None and parsed.get("lng") is not None,
                    parsed.get("municipality"),
                    parsed.get("province"),
                    parsed.get("geocode_accuracy_type"),
                ]
            )
            if not parsed_any:
                skipped_no_geocode_result += 1
            else:
                skipped_no_change += 1
            continue

        if dry_run:
            print(f"  [dry-run] {row['id']}: {updates}")
            updated += 1
            continue

        try:
            supabase.table("jobs").update(updates).eq("id", row["id"]).execute()
            updated += 1
            if updated % 50 == 0:
                print(f"  … updated {updated}/{examined}")
        except Exception as e:
            print(f"✗ DB update failed job {row['id']}: {e}", file=sys.stderr)
            errors += 1

    return {
        "examined": examined,
        "rows_updated": updated,
        "inferred_from_description": inferred,
        "skipped_blank_location": skipped_no_location,
        "skipped_no_geocode_result": skipped_no_geocode_result,
        "skipped_nothing_to_fill": skipped_no_change,
        "errors": errors,
        "dry_run": dry_run,
        "rewrite": rewrite,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill / rewrite incomplete job geocode fields from location",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--prod", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="Max jobs to examine")
    parser.add_argument(
        "--rewrite",
        action="store_true",
        help="Overwrite existing geo fields (default: fill nulls only)",
    )
    parser.add_argument(
        "--rewrite-location",
        action="store_true",
        help="Also rewrite jobs.location to 'Muni, PROV' (destructive)",
    )
    parser.add_argument(
        "--fill-only",
        action="store_true",
        help="Deprecated: fill-nulls is already the default",
    )
    parser.add_argument(
        "--no-infer",
        action="store_true",
        help="Do not infer location from description when location is blank",
    )
    args = parser.parse_args()

    rewrite = bool(args.rewrite) and not args.fill_only

    print("=" * 70)
    print("BACKFILL / REWRITE MISSING GEOCODE FIELDS (JOBS)")
    print("=" * 70)
    print(f"Dry run:  {args.dry_run}")
    print(f"Rewrite:  {rewrite}")
    print(f"Rewrite location: {args.rewrite_location}")
    print(f"Infer:    {not args.no_infer}")
    print(f"Limit:    {args.limit if args.limit else 'none'}")
    print()

    summary = run_backfill(
        dry_run=args.dry_run,
        limit=args.limit,
        rewrite=rewrite,
        rewrite_location=args.rewrite_location,
        infer_blank=not args.no_infer,
    )
    print("SUMMARY:", summary)


if __name__ == "__main__":
    main()
