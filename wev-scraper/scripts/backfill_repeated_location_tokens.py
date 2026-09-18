#!/usr/bin/env python
"""Clean jobs whose ``location`` has glued, repeated city tokens.

Fixes the "EtobicokeEtobicokeEtobicokeEtobicoke" artifact: some source pages
repeat the city across adjacent DOM nodes and Playwright ``inner_text()``
concatenates them with no separator. The scrape pipeline now collapses this at
save time (utils/normalize.py); this script repairs rows written before that.

Only ``jobs.location`` is rewritten (via normalize_messy_location). municipality /
province / coordinates are left untouched — they were derived through the
geocoding path, which already collapses the repeat.

Usage:
    python -m scripts.backfill_repeated_location_tokens [--dry-run] [--prod] [--limit N]

    --prod        Load ``.env.production`` (requires ``CONFIRM_PROD_RUN=YES``).
    --dry-run     Log intended updates without writing.
    --limit       Max rows to update (default: no cap).
    --batch-size  Rows per DB page (default: 500).
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
    has_repeated_location_token,
    normalize_messy_location,
)

DEFAULT_BATCH_SIZE = 500
# jobs.id is a UUID (text-sortable). Keyset-paginate from the nil UUID.
_NIL_UUID = "00000000-0000-0000-0000-000000000000"


def _fetch_page(after_id: str, batch_size: int) -> list[dict]:
    """Keyset page of jobs (id > after_id) that have a non-empty location."""
    resp = (
        supabase.table("jobs")
        .select("id, location")
        .not_.is_("location", "null")
        .gt("id", after_id)
        .order("id")
        .limit(batch_size)
        .execute()
    )
    return resp.data or []


def run(*, dry_run: bool, limit: int | None, batch_size: int) -> dict:
    examined = 0
    updated = 0
    after_id = _NIL_UUID

    while True:
        rows = _fetch_page(after_id, batch_size)
        if not rows:
            break
        after_id = rows[-1]["id"]

        for row in rows:
            examined += 1
            location = row.get("location")
            if not has_repeated_location_token(location):
                continue
            cleaned = normalize_messy_location(location) or None
            if not cleaned or cleaned == location:
                continue

            print(f"  job {row['id']}: {location!r} → {cleaned!r}")
            if not dry_run:
                try:
                    supabase.table("jobs").update({"location": cleaned}).eq(
                        "id", row["id"]
                    ).execute()
                except Exception as exc:  # noqa: BLE001
                    print(f"  ✗ update failed job {row['id']}: {exc}", file=sys.stderr)
                    continue
            updated += 1
            if limit is not None and updated >= limit:
                return {"examined": examined, "updated": updated, "dry_run": dry_run}

    return {"examined": examined, "updated": updated, "dry_run": dry_run}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Collapse glued repeated city tokens in jobs.location",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--prod", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="Max rows to update")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    args = parser.parse_args()

    print("=" * 70)
    print("BACKFILL REPEATED LOCATION TOKENS (JOBS)")
    print(f"Dry run:  {args.dry_run}")
    print(f"Limit:    {args.limit}")
    print("=" * 70)

    summary = run(
        dry_run=args.dry_run,
        limit=args.limit,
        batch_size=max(1, args.batch_size),
    )

    print("-" * 70)
    print(
        f"Done. examined={summary['examined']} updated={summary['updated']}"
        f"{' (dry-run)' if summary['dry_run'] else ''}"
    )


if __name__ == "__main__":
    main()
