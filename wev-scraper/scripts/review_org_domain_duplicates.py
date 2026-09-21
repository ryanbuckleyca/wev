#!/usr/bin/env python
"""Interactive terminal review for orgs that share an employer website domain.

Walks one conflict at a time. You pick the survivor (or skip). Merges move jobs
onto the survivor and delete the other org rows.

Optionally look up headquarters via OrganizationAssessor (Tavily-grounded) before
writing the merge — useful when duplicate rows carry different job cities for a
national org.

Usage:
    CONFIRM_PROD_RUN=YES ./venv/bin/python -m scripts.review_org_domain_duplicates --prod
    CONFIRM_PROD_RUN=YES ./venv/bin/python -m scripts.review_org_domain_duplicates --prod --dry-run
    CONFIRM_PROD_RUN=YES ./venv/bin/python -m scripts.review_org_domain_duplicates --prod --start 12
    CONFIRM_PROD_RUN=YES ./venv/bin/python -m scripts.review_org_domain_duplicates --prod --always-lookup-hq

Keys while reviewing
--------------------
  1..N   keep that row; merge the others into it (asks y/N before writing)
  h      look up HQ for the suggested survivor (no merge yet)
  h N    look up HQ for list item N
  u N    edit a field on list item N (repeat for multiple rows)
  u N field=value   same, non-interactive (empty value clears)
  s      skip this conflict
  i ID   keep organization id ID
  q      quit (progress is printed; re-run with --start to resume)
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from utils.prod_env import bootstrap_prod_from_argv, confirm_prod_run

if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    bootstrap_prod_from_argv(sys.argv[1:], Path(__file__))
    print("Using PRODUCTION database")
else:
    print("Using TEST database")

from utils.db import fetch_all_rows, supabase  # noqa: E402
from utils.organization_cache import evidence_domain  # noqa: E402

# Shared portals / directories — not a single employer identity.
PORTAL_DOMAINS = frozenset(
    {
        "ontario.ca",
        "quebec.ca",
        "toronto.ca",
        "canada.ca",
        "gc.ca",
        "uvic.ca",
        "trca.ca",
        "rmjq.org",
        "tablesdequartiermontreal.org",
        "facebook.com",
        "linkedin.com",
        "indeed.com",
    }
)

_HQ_LOCATION_FIELDS = (
    "location",
    "municipality",
    "province",
    "lat",
    "lng",
    "geocode_accuracy_type",
)

# Safe fields for in-review fixes (wrong website, scraped name noise, etc.).
# Updating location (or municipality/province) re-geocodes via Geocodio, same as
# the assessor / HQ path — writes municipality, province, lat, lng, accuracy.
EDITABLE_FIELDS = frozenset(
    {
        "website",
        "name",
        "municipality",
        "province",
        "location",
    }
)

_GEO_FIELDS = (
    "location",
    "municipality",
    "province",
    "lat",
    "lng",
    "geocode_accuracy_type",
)


def _job_counts(ids: list[int]) -> dict[int, int]:
    counts: dict[int, int] = {}
    for oid in ids:
        resp = (
            supabase.table("jobs")
            .select("id", count="exact")
            .eq("organization_id", oid)
            .execute()
        )
        counts[oid] = resp.count if resp.count is not None else 0
    return counts


def load_conflicts() -> list[tuple[str, list[dict]]]:
    try:
        orgs = fetch_all_rows(
            "organizations",
            "id, name, location, website, slug, municipality, province, alternative_names",
        )
    except Exception as exc:
        print(f"NOTE: loading without alternative_names ({exc})")
        orgs = fetch_all_rows(
            "organizations",
            "id, name, location, website, slug, municipality, province",
        )
    by_domain: dict[str, list[dict]] = defaultdict(list)
    for o in orgs:
        domain = evidence_domain(o.get("website"))
        if domain and domain not in PORTAL_DOMAINS:
            by_domain[domain].append(o)

    clusters = [(d, rows) for d, rows in by_domain.items() if len(rows) > 1]
    clusters.sort(key=lambda item: (-len(item[1]), item[0]))

    all_ids = [int(r["id"]) for _, rows in clusters for r in rows]
    print(f"Counting jobs for {len(all_ids)} candidate rows…")
    counts = _job_counts(all_ids)

    enriched: list[tuple[str, list[dict]]] = []
    for domain, rows in clusters:
        for r in rows:
            r["_jobs"] = counts.get(int(r["id"]), 0)
        rows = sorted(rows, key=lambda r: (-r["_jobs"], int(r["id"])))
        enriched.append((domain, rows))
    return enriched


def cities_differ(rows: list[dict]) -> bool:
    munis = {
        (r.get("municipality") or "").strip().lower()
        for r in rows
        if (r.get("municipality") or "").strip()
    }
    return len(munis) > 1


def print_conflict(index: int, total: int, domain: str, rows: list[dict]) -> None:
    print()
    print("=" * 72)
    print(f"Conflict {index}/{total}   domain={domain}   ({len(rows)} orgs)")
    if cities_differ(rows):
        print("  note: rows disagree on city — consider HQ lookup (h) before merge")
    print("=" * 72)
    for i, r in enumerate(rows, 1):
        muni = r.get("municipality") or "—"
        prov = r.get("province") or "—"
        print(f"  [{i}] id={r['id']}   jobs={r['_jobs']}")
        print(f"      {r.get('name')}")
        alts = r.get("alternative_names") or []
        if alts:
            print(f"      aka: {', '.join(alts)}")
        print(f"      {muni}, {prov}   slug={r.get('slug')}")
        print(f"      {r.get('website')}")
    print()
    print("  1..N  keep that row's *name* (merge the others); HQ is separate")
    print("  h / h N   look up HQ for this conflict (applied to whoever you keep)")
    print("  u N / u N field=value   edit a row (repeat as needed)")
    print("  s     skip")
    print("  i ID  keep organization id ID")
    print("  q     quit")


def geocode_location_string(loc: str | None) -> dict[str, Any]:
    """Geocode like the org assessor / HQ path. Empty loc clears all geo fields."""
    from utils.location_parser import parse_address_with_geocodio

    if not (loc or "").strip():
        return {k: None for k in _GEO_FIELDS}

    loc = loc.strip()
    geo = parse_address_with_geocodio(loc)
    municipality = geo.get("municipality")
    province = geo.get("province")
    # Prefer a clean "City, PR" display when Geocodio resolved both.
    display = loc
    if municipality and province:
        display = f"{municipality}, {province}"
    elif municipality:
        display = municipality
    return {
        "location": display,
        "municipality": municipality,
        "province": province,
        "lat": geo.get("lat"),
        "lng": geo.get("lng"),
        "geocode_accuracy_type": geo.get("geocode_accuracy_type"),
    }


def apply_field_update(
    org: dict,
    field: str,
    value: str | None,
    *,
    dry_run: bool,
) -> bool:
    """Write one editable field onto *org* (mutates the in-memory row).

    Location / municipality / province updates re-geocode and rewrite the full
    geo field set (same Geocodio path as assessment).
    """
    if field not in EDITABLE_FIELDS:
        print(f"  Unsupported field {field!r}. Allowed: {', '.join(sorted(EDITABLE_FIELDS))}")
        return False

    oid = int(org["id"])
    old = org.get(field)
    new_val: str | None = value
    if new_val is not None:
        new_val = new_val.strip() or None

    updates: dict[str, Any]
    if field == "location":
        print(f"  → id={oid}  location: {old!r} → {new_val!r}  (re-geocoding)")
        updates = geocode_location_string(new_val)
    elif field in {"municipality", "province"}:
        # Compose a location string from the edited field + the sibling, then
        # geocode so lat/lng/accuracy match a normal location write.
        muni = new_val if field == "municipality" else org.get("municipality")
        prov = new_val if field == "province" else org.get("province")
        composed = ", ".join(part for part in (muni, prov) if part) or None
        print(
            f"  → id={oid}  {field}: {old!r} → {new_val!r}  "
            f"(re-geocoding from {composed!r})"
        )
        updates = geocode_location_string(composed)
        # If they cleared municipality but left province, geocode still runs on
        # province-only; if both empty, all geo fields clear.
    else:
        print(f"  → id={oid}  {field}: {old!r} → {new_val!r}")
        updates = {field: new_val}

    if "location" in updates or "municipality" in updates:
        print(
            f"  geo → location={updates.get('location')!r} "
            f"municipality={updates.get('municipality')!r} "
            f"province={updates.get('province')!r} "
            f"lat={updates.get('lat')} lng={updates.get('lng')} "
            f"accuracy={updates.get('geocode_accuracy_type')!r}"
        )

    if dry_run:
        print("  (dry-run — no DB write)")
        org.update(updates)
        return True

    try:
        supabase.table("organizations").update(updates).eq("id", oid).execute()
    except Exception as exc:
        print(f"  update failed: {exc}")
        return False

    org.update(updates)
    print(f"  updated organization {oid}")
    if field == "website":
        print("  tip: if websites no longer match, skip this conflict (s).")
    return True


def prompt_field_update(org: dict, *, dry_run: bool, preset: str | None = None) -> bool:
    """Interactive (or shorthand) field edit for one org row.

    *preset* forms:
      None            → ask field, then value
      "website"       → ask value for website
      "website=https://…" / "website=" → apply directly (empty clears)
    """
    field: str | None = None
    value: str | None = None

    if preset is None:
        try:
            field_raw = input(
                f"  field [{'/'.join(sorted(EDITABLE_FIELDS))}] > "
            ).strip().lower()
        except EOFError:
            print("  cancelled.")
            return False
        if not field_raw:
            print("  cancelled.")
            return False
        if "=" in field_raw:
            field, _, rest = field_raw.partition("=")
            field = field.strip().lower()
            value = rest  # may be ""
        else:
            field = field_raw
    elif "=" in preset:
        field, _, rest = preset.partition("=")
        field = field.strip().lower()
        value = rest
    else:
        field = preset.strip().lower()

    if not field:
        print("  cancelled.")
        return False
    if field not in EDITABLE_FIELDS:
        print(f"  Unsupported field {field!r}. Allowed: {', '.join(sorted(EDITABLE_FIELDS))}")
        return False

    if value is None:
        current = org.get(field)
        try:
            value = input(f"  new {field} (empty clears) [was {current!r}] > ")
        except EOFError:
            print("  cancelled.")
            return False

    return apply_field_update(org, field, value, dry_run=dry_run)


def lookup_hq(org: dict) -> dict[str, Any] | None:
    """Tavily-grounded HQ lookup. Does not bias search to a job city."""
    from utils.location_parser import parse_address_with_geocodio
    from utils.organization_assessment import OrganizationAssessor

    name = (org.get("name") or "").strip()
    website = (org.get("website") or "").strip() or None
    if not name:
        print("  HQ lookup: empty name — skipped")
        return None

    print(f"  Looking up HQ for {name!r} (website={website!r})…")
    assessor = OrganizationAssessor()
    # No municipality/province: avoid anchoring a national org to a job city.
    outcome = assessor.assess_with_outcome(
        raw_name=name,
        municipality=None,
        province=None,
        job_title="",
        description="",
        known_website=website,
    )
    if outcome.result is None:
        print(f"  HQ lookup failed: {outcome.skip_reason or 'unknown'}")
        return None

    result = outcome.result
    scope = result.get("geographic_scope")
    hq_mun = result.get("headquarters_municipality")
    hq_prov = result.get("headquarters_province")
    print(f"  geographic_scope={scope!r}")
    print(f"  headquarters={hq_mun!r}, {hq_prov!r}")

    if not hq_mun:
        print("  No city-level HQ found — leaving survivor location unchanged.")
        return None

    hq_loc = ", ".join(part for part in (hq_mun, hq_prov) if part)
    geo = parse_address_with_geocodio(hq_loc)
    municipality = geo.get("municipality") or hq_mun
    province = geo.get("province") or hq_prov
    patch = {
        "location": hq_loc,
        "municipality": municipality,
        "province": province,
        "lat": geo.get("lat"),
        "lng": geo.get("lng"),
        "geocode_accuracy_type": geo.get("geocode_accuracy_type"),
    }
    print(
        f"  HQ patch: {municipality}, {province} "
        f"(lat={patch['lat']}, lng={patch['lng']})"
    )
    return patch


def apply_merge(
    survivor_id: int,
    merge_ids: list[int],
    rows: list[dict],
    *,
    dry_run: bool,
    location_patch: dict[str, Any] | None = None,
) -> None:
    from utils.organization_cache import merge_alternative_names

    print(f"\n  → keep {survivor_id}, merge {merge_ids}")
    if location_patch:
        print(f"  → set survivor location: {location_patch.get('location')!r}")

    by_id = {int(r["id"]): r for r in rows}
    survivor = by_id.get(survivor_id) or {"id": survivor_id, "name": str(survivor_id)}

    if dry_run:
        absorbed_preview = [by_id[mid] for mid in merge_ids if mid in by_id]
        preview_alts = merge_alternative_names(
            survivor.get("name") or "",
            survivor.get("alternative_names"),
            absorbed_preview,
        )
        if preview_alts:
            print(f"  → alternative_names (would promote after delete): {preview_alts}")
        print("  (dry-run — no DB writes)")
        return

    # Location / HQ fields can update immediately; aliases wait until deletes succeed.
    if location_patch:
        fields = {
            k: location_patch[k] for k in _HQ_LOCATION_FIELDS if k in location_patch
        }
        if fields:
            try:
                supabase.table("organizations").update(fields).eq("id", survivor_id).execute()
                print(f"  updated organization {survivor_id} location fields")
                survivor.update(fields)
            except Exception as exc:
                print(f"  WARNING: could not update survivor location: {exc}")

    deleted_ids: list[int] = []
    for merge_id in merge_ids:
        try:
            resp = (
                supabase.table("jobs")
                .update({"organization_id": survivor_id})
                .eq("organization_id", merge_id)
                .execute()
            )
            n = len(resp.data or [])
            print(f"  jobs {merge_id} → {survivor_id}: {n} row(s)")
        except Exception as exc:
            print(f"  ERROR updating jobs {merge_id} → {survivor_id}: {exc}")
            continue
        try:
            supabase.table("organizations").delete().eq("id", merge_id).execute()
            print(f"  deleted organization {merge_id}")
            deleted_ids.append(merge_id)
        except Exception as exc:
            print(f"  ERROR deleting organization {merge_id}: {exc}")

    if not deleted_ids:
        return

    absorbed = [
        by_id.get(mid) or {"id": mid, "name": None, "alternative_names": []}
        for mid in deleted_ids
    ]
    new_alts = merge_alternative_names(
        survivor.get("name") or "",
        survivor.get("alternative_names"),
        absorbed,
    )
    if not new_alts or new_alts == list(survivor.get("alternative_names") or []):
        return

    try:
        supabase.table("organizations").update(
            {"alternative_names": new_alts}
        ).eq("id", survivor_id).execute()
        print(f"  survivor {survivor_id} alternative_names → {new_alts}")
    except Exception as exc:
        print(f"  WARNING: alternative_names promote failed for {survivor_id}: {exc}")


def parse_choice(raw: str, rows: list[dict]) -> tuple[str, Any]:
    """Return (action, payload).

    Actions: keep (org id), skip, quit, hq (1-based index), update ((index, preset)),
    invalid.
    """
    text = raw.strip()
    if not text:
        return "invalid", None
    lower = text.lower()
    if lower in {"q", "quit"}:
        return "quit", None
    if lower in {"s", "skip"}:
        return "skip", None
    if lower == "h":
        return "hq", 1  # suggested = first row (most jobs)
    if lower.startswith("h "):
        parts = lower.split()
        try:
            n = int(parts[1])
        except (IndexError, ValueError):
            return "invalid", None
        if 1 <= n <= len(rows):
            return "hq", n
        return "invalid", None
    if lower.startswith("u "):
        # u N | u N field | u N field=value
        rest = text[2:].strip()
        if not rest:
            return "invalid", None
        parts = rest.split(None, 1)
        try:
            n = int(parts[0])
        except ValueError:
            return "invalid", None
        if not (1 <= n <= len(rows)):
            return "invalid", None
        preset = parts[1] if len(parts) > 1 else None
        return "update", (n, preset)
    if lower.startswith("i ") or lower.startswith("id "):
        parts = lower.split()
        try:
            return "keep", int(parts[1])
        except (IndexError, ValueError):
            return "invalid", None
    if lower.isdigit():
        n = int(lower)
        if 1 <= n <= len(rows):
            return "keep", int(rows[n - 1]["id"])
        return "invalid", None
    return "invalid", None


def confirm(prompt: str) -> bool:
    try:
        return input(prompt).strip().lower() in {"y", "yes"}
    except EOFError:
        return False


def resolve_org(rows: list[dict], survivor_id: int) -> dict:
    for r in rows:
        if int(r["id"]) == survivor_id:
            return r
    return {"id": survivor_id, "name": str(survivor_id), "website": None}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Interactively review/merge orgs that share an employer domain."
    )
    parser.add_argument("--prod", action="store_true", help="Use production database.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Walk conflicts without writing merges.",
    )
    parser.add_argument(
        "--start",
        type=int,
        default=1,
        metavar="N",
        help="1-based conflict index to start at (resume).",
    )
    parser.add_argument(
        "--always-lookup-hq",
        action="store_true",
        help="On every merge, look up HQ via assessment before writing (no prompt).",
    )
    args = parser.parse_args()

    conflicts = load_conflicts()
    total = len(conflicts)
    if total == 0:
        print("No shared-domain conflicts found.")
        return

    start = max(1, min(args.start, total))
    print(f"\n{total} conflicts. Starting at {start}.")
    if args.dry_run:
        print("DRY RUN — decisions will not write to the DB.")
    if args.always_lookup_hq:
        print("Will look up HQ on every merge.")

    merged = 0
    skipped = 0
    updated = 0

    for index in range(start, total + 1):
        domain, rows = conflicts[index - 1]
        print_conflict(index, total, domain, rows)
        # HQ is for the conflict (national org), not tied to which list item you queried.
        conflict_hq: dict[str, Any] | None = None
        conflict_hq_looked_up = False

        while True:
            try:
                raw = input(f"\n[{index}/{total}] choice > ")
            except EOFError:
                print("\n(end of input)")
                raw = "q"
            action, value = parse_choice(raw, rows)
            if action == "invalid":
                print("  Invalid. Use 1..N, h, h N, u N, s, i <id>, or q.")
                continue
            if action == "quit":
                print(
                    f"\nStopped at conflict {index}/{total}. "
                    f"merged={merged} skipped={skipped} updated={updated}. "
                    f"Resume with --start {index}"
                )
                return
            if action == "skip":
                skipped += 1
                print("  skipped.")
                break
            if action == "hq":
                assert value is not None
                org = rows[value - 1]
                if conflict_hq_looked_up:
                    print("  (HQ already looked up for this conflict)")
                    if conflict_hq:
                        print(f"  HQ patch: {conflict_hq.get('location')!r}")
                    else:
                        print("  No city-level HQ found.")
                else:
                    conflict_hq = lookup_hq(org)
                    conflict_hq_looked_up = True
                if conflict_hq:
                    print(
                        f"  → will write {conflict_hq.get('location')!r} onto "
                        f"whichever row you keep (1..N). Name choice is separate."
                    )
                continue
            if action == "update":
                assert value is not None
                list_index, preset = value
                org = rows[list_index - 1]
                if prompt_field_update(org, dry_run=args.dry_run, preset=preset):
                    updated += 1
                    # Stay on this conflict so more rows can be fixed.
                    print_conflict(index, total, domain, rows)
                continue

            survivor_id = value
            assert survivor_id is not None
            merge_ids = [int(r["id"]) for r in rows if int(r["id"]) != survivor_id]
            if not merge_ids:
                print("  Nothing to merge.")
                skipped += 1
                break
            if survivor_id not in {int(r["id"]) for r in rows}:
                print(f"  id {survivor_id} is not in this conflict.")
                continue

            survivor = resolve_org(rows, survivor_id)
            label = survivor.get("name") or str(survivor_id)
            print(f"  Keep name/row {survivor_id} ({label})")
            print(f"  Merge & delete: {merge_ids}")

            location_patch: dict[str, Any] | None = None
            if conflict_hq_looked_up:
                location_patch = conflict_hq
                if location_patch:
                    print(f"  Using HQ from earlier lookup: {location_patch.get('location')!r}")
                else:
                    print("  Earlier HQ lookup found no city — leaving location as-is.")
            else:
                want_hq = args.always_lookup_hq
                if not want_hq:
                    default_hint = " [Y/n]" if cities_differ(rows) else " [y/N]"
                    if cities_differ(rows):
                        try:
                            ans = input(
                                f"  Lookup HQ before merge?{default_hint} > "
                            ).strip().lower()
                        except EOFError:
                            ans = "y"
                        want_hq = ans not in {"n", "no"}
                    else:
                        want_hq = confirm(f"  Lookup HQ before merge?{default_hint} > ")

                if want_hq:
                    conflict_hq = lookup_hq(survivor)
                    conflict_hq_looked_up = True
                    location_patch = conflict_hq

            if args.dry_run or confirm("  Apply this merge? [y/N] > "):
                apply_merge(
                    survivor_id,
                    merge_ids,
                    rows,
                    dry_run=args.dry_run,
                    location_patch=location_patch,
                )
                merged += 1
            else:
                print("  not applied — still on this conflict.")
                continue
            break

    print(f"\nDone. merged={merged} skipped={skipped} updated={updated} of {total}.")


if __name__ == "__main__":
    main()
