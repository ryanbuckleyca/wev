#!/usr/bin/env python
"""Fill missing Geocodio-derived fields on existing jobs (no scraper / parser changes).

Typical reason data is missing: runs used ``SHOULD_GEOCODE=0``, so
``normalize_job_data`` never called Geocodio and rows were inserted with
``lat`` / ``municipality`` / ``province`` / ``geocode_accuracy_type`` unset.

This script re-queries Geocodio using each job's stored ``location`` string and
updates **only** columns that are currently null/empty (never overwrites
non-null municipality/province with a new guess).

Usage:
    python -m scripts.backfill_missing_geocode_fields [--dry-run] [--prod] [--limit N]

    --prod     Load ``.env.production`` and set ``USE_PROD_DB=1`` (requires
               ``CONFIRM_PROD_RUN=YES`` when stdin is not a TTY).
    --dry-run  Log intended updates without writing.
    --limit    Max jobs to consider (default: no cap).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from settings import ensure_env_loaded, load_env_file  # noqa: E402

ensure_env_loaded()
if "--prod" in sys.argv[1:]:
    _root = Path(__file__).resolve().parent.parent.parent
    _scraper = Path(__file__).resolve().parent.parent
    _prod_env = (
        _root / ".env.production"
        if (_root / ".env.production").exists()
        else _scraper / ".env.production"
    )
    if not _prod_env.exists():
        print(f"❌ {_prod_env} not found — required for --prod.", file=sys.stderr)
        sys.exit(1)
    load_env_file(_prod_env)

if "--prod" in sys.argv[1:] and os.environ.get("CONFIRM_PROD_RUN") == "YES":
    os.environ["USE_PROD_DB"] = "1"
    print("🔥 Using PRODUCTION database (confirmation skipped)")
elif "--prod" in sys.argv[1:]:
    if sys.stdin.isatty():
        print("\nWARNING: You are about to run against the PRODUCTION database.")
        print("This will modify real data.\n")
        _resp = input("Type YES to continue, anything else to abort: ")
        if _resp.strip() != "YES":
            print("Aborted.")
            sys.exit(1)
    elif os.environ.get("CONFIRM_PROD_RUN") != "YES":
        print(
            "Refusing to run against production in non-interactive mode. "
            "Set CONFIRM_PROD_RUN=YES to override.",
            file=sys.stderr,
        )
        sys.exit(1)
    os.environ["USE_PROD_DB"] = "1"
    print("🔥 Using PRODUCTION database")
elif os.environ.get("USE_PROD_DB") == "1":
    print("🔥 Using PRODUCTION database (USE_PROD_DB=1)")
else:
    print("🧪 Using configured database (from .env)")

from utils.db import supabase  # noqa: E402
from utils.location_parser import parse_address_with_geocodio  # noqa: E402
from utils.municipality_canonical import canonicalize_municipality  # noqa: E402


def _is_empty(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def _build_updates(row: dict, parsed: dict) -> dict:
    """Return DB update dict: only fill fields that are missing on the row."""
    updates: dict = {}
    lat, lng = parsed.get("lat"), parsed.get("lng")
    if lat is not None and lng is not None:
        if _is_empty(row.get("lat")) or _is_empty(row.get("lng")):
            updates["lat"] = lat
            updates["lng"] = lng
    acc = parsed.get("geocode_accuracy_type")
    if acc and _is_empty(row.get("geocode_accuracy_type")):
        updates["geocode_accuracy_type"] = acc

    muni = canonicalize_municipality(parsed.get("municipality"), parsed.get("province"))
    prov = parsed.get("province")
    if muni and _is_empty(row.get("municipality")):
        updates["municipality"] = muni
    if prov and _is_empty(row.get("province")):
        updates["province"] = prov
    return updates


def run_backfill(*, dry_run: bool, limit: int | None) -> dict:
    page = 500
    offset = 0
    examined = 0
    updated = 0
    skipped_no_location = 0
    skipped_no_change = 0
    skipped_no_geocode_result = 0
    errors = 0

    while True:
        if limit is not None and examined >= limit:
            break
        q = (
            supabase.table("jobs")
            .select(
                "id,location,municipality,province,lat,lng,geocode_accuracy_type",
            )
            .not_.is_("location", "null")
            .or_(
                "lat.is.null,lng.is.null,municipality.is.null,"
                "province.is.null,geocode_accuracy_type.is.null",
            )
            .order("id")
            .range(offset, offset + page - 1)
        )
        try:
            rows = q.execute().data or []
        except Exception as e:
            print(f"✗ Query failed at offset {offset}: {e}", file=sys.stderr)
            errors += 1
            break

        if not rows:
            break

        for row in rows:
            if limit is not None and examined >= limit:
                break
            examined += 1
            loc = (row.get("location") or "").strip()
            if not loc:
                skipped_no_location += 1
                continue

            try:
                parsed = parse_address_with_geocodio(loc)
            except Exception as e:
                print(f"✗ Geocodio exception job {row['id']}: {e}", file=sys.stderr)
                errors += 1
                continue

            updates = _build_updates(row, parsed)
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
            except Exception as e:
                print(f"✗ DB update failed job {row['id']}: {e}", file=sys.stderr)
                errors += 1

        if limit is not None and examined >= limit:
            break
        if len(rows) < page:
            break
        offset += page

    summary = {
        "examined": examined,
        "rows_updated": updated,
        "skipped_blank_location": skipped_no_location,
        "skipped_no_geocode_result": skipped_no_geocode_result,
        "skipped_nothing_to_fill": skipped_no_change,
        "errors": errors,
        "dry_run": dry_run,
    }
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill missing lat/lng/municipality/province/geocode_accuracy from location",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--prod", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="Max jobs to examine")
    args = parser.parse_args()

    print("=" * 70)
    print("BACKFILL MISSING GEOCODE FIELDS")
    print("=" * 70)
    print(f"Dry run: {args.dry_run}")
    print(f"Limit:   {args.limit if args.limit else 'none'}")
    print()

    summary = run_backfill(dry_run=args.dry_run, limit=args.limit)
    print("SUMMARY:", summary)


if __name__ == "__main__":
    main()
