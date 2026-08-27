r"""
Backfill `jobs.municipality`: within each (province, accent-folded name), pick one label
and set every row to that label.

Groups rows whose names differ only by accents/case (Unicode NFD, strip combining marks,
lowercase — same idea as JS `normalize().replace(/\\p{Mn}/gu,'').toLowerCase()`).

Chooses the **ASCII (non-accented)** NFC spelling when variants differ only by accents;
ties break by shorter length, then lexicographic order (aligns with Geocodio `city`).

Run from `wev-scraper` root (uses project venv):

    .venv/bin/python -m utils.backfill_municipality_canonical
    .venv/bin/python -m utils.backfill_municipality_canonical --apply
    .venv/bin/python -m utils.backfill_municipality_canonical --apply --quiet
"""

from __future__ import annotations

import argparse
import unicodedata
from collections import defaultdict

from utils.db import PAGE_SIZE, supabase
from utils.municipality_canonical import normalize_location, pick_preferred_municipality_label


def _paginate_jobs(columns: str):
    offset = 0
    while True:
        resp = (
            supabase.table("jobs")
            .select(columns)
            .not_.is_("municipality", "null")
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break
        yield rows
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", (s or "").strip())


def backfill_accent_merges(*, apply: bool, quiet: bool) -> dict[str, int]:
    clusters: dict[tuple[str, str], set[str]] = defaultdict(set)
    for batch in _paginate_jobs("municipality, province"):
        for row in batch:
            m = row["municipality"]
            if not m or not str(m).strip():
                continue
            province = _nfc(str(row.get("province") or ""))
            clusters[(province, normalize_location(m))].add(_nfc(str(m)))

    preferred: dict[tuple[str, str], str] = {}
    merge_groups: list[tuple[tuple[str, str], list[str], str]] = []
    for key, variants in clusters.items():
        distinct = sorted(variants)
        chosen = pick_preferred_municipality_label(distinct)
        preferred[key] = chosen
        if len(distinct) > 1:
            merge_groups.append((key, distinct, chosen))

    if not quiet and merge_groups:
        print("Accent-merge groups (province + fold-key -> chosen label):")
        for (prov, _), variants, chosen in sorted(merge_groups, key=lambda x: (x[0][0], x[2])):
            var_str = ", ".join(repr(v) for v in variants)
            print(f"  [{prov!r}] {var_str} => {chosen!r}")
        print()

    updated = 0
    unchanged = 0
    for batch in _paginate_jobs("id, municipality, province"):
        for row in batch:
            old = row["municipality"]
            if old is None or not str(old).strip():
                unchanged += 1
                continue
            province = _nfc(str(row.get("province") or ""))
            key = (province, normalize_location(str(old)))
            new = preferred.get(key, _nfc(str(old)))
            if new == _nfc(str(old)):
                unchanged += 1
                continue
            if apply:
                supabase.table("jobs").update({"municipality": new}).eq("id", row["id"]).execute()
            if not quiet:
                print(f"\t{'UPDATE' if apply else 'WOULD UPDATE'} {row['id']}: {old!r} -> {new!r}")
            updated += 1

    return {"updated": updated, "unchanged": unchanged, "merge_groups": len(merge_groups)}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Merge municipality strings that differ only by accents (per province).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write updates (default: dry-run)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Skip per-row and merge-group listing",
    )
    args = parser.parse_args()

    print("Municipality accent backfill (dry-run unless --apply)\n")
    stats = backfill_accent_merges(apply=args.apply, quiet=args.quiet)
    print(
        f"Merge groups with 2+ spellings: {stats['merge_groups']}. "
        f"Rows {'updated' if args.apply else 'that would change'}: {stats['updated']}, "
        f"unchanged: {stats['unchanged']}."
    )


if __name__ == "__main__":
    main()
