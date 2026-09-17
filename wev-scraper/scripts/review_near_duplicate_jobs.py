#!/usr/bin/env python
"""Interactive review for near-duplicate jobs (cross-board / retitled postings).

Finds clusters where the same employer has jobs with similar titles, posted
around the same time, but different listing URLs. You keep one row; the others
are deleted (same as URL-based cleanup_job_duplicates).

This is intentionally post-hoc — fuzzy matches need a human. Exact listing_url
dupes remain handled by cleanup_job_duplicates / scrape-time URL checks.
Confident content clones are also auto-skipped at insert time in save_job.

Usage:
    CONFIRM_PROD_RUN=YES ./venv/bin/python -m scripts.review_near_duplicate_jobs --prod
    CONFIRM_PROD_RUN=YES ./venv/bin/python -m scripts.review_near_duplicate_jobs --prod --dry-run
    CONFIRM_PROD_RUN=YES ./venv/bin/python -m scripts.review_near_duplicate_jobs --prod --start 3
    CONFIRM_PROD_RUN=YES ./venv/bin/python -m scripts.review_near_duplicate_jobs --prod --days 45

Keys while reviewing
--------------------
  1..N     keep that row; delete the others (asks y/N)
  k 1 2    keep those list items; delete the rest
  l N      re-lookup location for list item N from its scraped description,
           then Geocode (fixes Eco Canada metadata / Hamilton Township misses)
  s        skip this cluster
  i ID     keep job uuid ID
  q        quit (resume with --start)
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timedelta, timezone
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
from utils.job_near_dupes import (  # noqa: E402
    NearDupeCluster,
    cities_conflict,
    cluster_near_duplicate_jobs,
    description_ratio,
    job_quality_score,
    title_jaccard,
)

_JOB_COLUMNS = (
    "id, organization, organization_id, job_title, listing_url, date_posted, "
    "close_date, description, summary, values, scraped_at, location, "
    "municipality, province, lat, lng, geocode_accuracy_type, source_id, wage, "
    "unit_text, min_value, max_value, employment_type, work_type, is_remote"
)

_GEO_FIELDS = (
    "location",
    "municipality",
    "province",
    "lat",
    "lng",
    "geocode_accuracy_type",
)


def _load_source_names() -> dict[str, str]:
    try:
        rows = fetch_all_rows("sources", "id, name, slug")
    except Exception as exc:
        print(f"NOTE: could not load sources ({exc})")
        return {}
    out: dict[str, str] = {}
    for row in rows:
        sid = str(row.get("id") or "")
        if not sid:
            continue
        out[sid] = (row.get("name") or row.get("slug") or sid).strip()
    return out


def load_clusters(*, max_days: int, lookback_days: int | None) -> list[NearDupeCluster]:
    print("Fetching jobs…")
    jobs = fetch_all_rows("jobs", _JOB_COLUMNS, order_by="scraped_at", desc=True)
    print(f"  {len(jobs)} jobs loaded")

    source_names = _load_source_names()
    for job in jobs:
        sid = str(job.get("source_id") or "")
        job["_source_name"] = source_names.get(sid) or sid or "—"

    if lookback_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        cutoff_iso = cutoff.isoformat()
        before = len(jobs)
        jobs = [
            j
            for j in jobs
            if (j.get("scraped_at") or "") >= cutoff_iso
            or (j.get("date_posted") or "") >= cutoff.date().isoformat()
        ]
        print(f"  {len(jobs)} after lookback={lookback_days}d (from {before})")

    print("Clustering near-duplicates…")
    clusters = cluster_near_duplicate_jobs(jobs, max_days=max_days)
    print(f"  {len(clusters)} cluster(s)")
    return clusters


def _short(text: str | None, n: int = 100) -> str:
    s = _WS_JOIN((text or "").strip())
    if len(s) <= n:
        return s
    return s[: n - 1] + "…"


def _WS_JOIN(s: str) -> str:
    return " ".join(s.split())


def _strip_html(text: str | None) -> str:
    if not text:
        return ""
    # Cheap readability for terminal review — not a full HTML sanitizer.
    cleaned = re.sub(r"(?i)<br\s*/?>", " ", text)
    cleaned = re.sub(r"(?i)</p\s*>", " ", cleaned)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    return _WS_JOIN(cleaned)


def _fmt_money_cents(value: Any) -> str | None:
    if value is None:
        return None
    try:
        cents = int(value)
    except (TypeError, ValueError):
        return None
    dollars = cents / 100.0
    if dollars == int(dollars):
        return f"${int(dollars):,}"
    return f"${dollars:,.2f}"


def _compensation_label(job: dict) -> str:
    wage = (job.get("wage") or "").strip()
    if wage:
        return wage
    lo = _fmt_money_cents(job.get("min_value"))
    hi = _fmt_money_cents(job.get("max_value"))
    unit = (job.get("unit_text") or "").strip()
    if lo and hi and lo != hi:
        base = f"{lo}–{hi}"
    else:
        base = lo or hi
    if not base:
        return "—"
    if unit:
        return f"{base} / {unit}"
    return base


def _work_label(job: dict) -> str:
    parts: list[str] = []
    emp = (job.get("employment_type") or "").strip()
    if emp:
        parts.append(emp)
    wt = (job.get("work_type") or "").strip()
    if wt:
        parts.append(wt)
    if job.get("is_remote") is True:
        parts.append("remote")
    elif job.get("is_remote") is False and wt != "office":
        parts.append("not-remote")
    return ", ".join(parts) if parts else "—"


def _desc_location_hint(job: dict) -> str | None:
    """Best-effort city from the scraped description (for display)."""
    from utils.location_parser import infer_location_string_from_text

    return infer_location_string_from_text(job.get("description"))


def print_cluster(index: int, total: int, cluster: NearDupeCluster) -> None:
    jobs = cluster.jobs
    print()
    print("=" * 72)
    print(
        f"Cluster {index}/{total}   linked_org={cluster.org_label!r}   "
        f"({len(jobs)} jobs, {cluster.org_key})"
    )
    print("=" * 72)
    for i, job in enumerate(jobs, 1):
        best = "  ← suggested keep" if i == 1 else ""
        scraped_org = (job.get("organization") or "").strip() or "—"
        oid = job.get("organization_id")
        print(f"  [{i}] id={job['id']}{best}")
        print(f"      title: {job.get('job_title')}")
        print(f"      org:   {scraped_org}   organization_id={oid if oid is not None else '—'}")
        print(f"      pay:   {_compensation_label(job)}")
        print(f"      type:  {_work_label(job)}")
        loc = (job.get("location") or "").strip() or "—"
        muni = job.get("municipality") or "—"
        prov = job.get("province") or "—"
        print(f"      loc:   {loc}   ({muni}, {prov})")
        hint = _desc_location_hint(job)
        if hint and hint.lower() not in {str(loc).lower(), f"{muni}, {prov}".lower()}:
            print(f"      desc→  {hint}   (from description; use l {i} to apply)")
        elif hint:
            print(f"      desc→  {hint}")
        print(
            f"      dates: posted={job.get('date_posted') or '—'}   "
            f"close={job.get('close_date') or '—'}   "
            f"scraped={(job.get('scraped_at') or '')[:10] or '—'}"
        )
        print(f"      source:{job.get('_source_name') or '—'}")
        print(f"      url:   {job.get('listing_url')}")
        summary = _strip_html(job.get("summary"))
        if summary:
            print(f"      summary:{_short(summary, 140)}")
        print(f"      desc:  {_short(_strip_html(job.get('description')), 140)}")
    if len(jobs) >= 2:
        print("\n  pairwise:")
        for i in range(len(jobs)):
            for j in range(i + 1, len(jobs)):
                a, b = jobs[i], jobs[j]
                tj = title_jaccard(a.get("job_title"), b.get("job_title"))
                dr = description_ratio(a.get("description"), b.get("description"))
                city = "city≠" if cities_conflict(a, b) else "city~"
                print(f"    [{i + 1}]↔[{j + 1}]  title={tj:.2f}  desc={dr:.2f}  {city}")
    print()
    print("  1..N     keep that row (delete the others)")
    print("  k 1 2    keep those rows (delete the rest)")
    print("  l N      re-lookup location from description + geocode")
    print("  s        skip")
    print("  i ID     keep job uuid ID")
    print("  q        quit")


def geocode_location_string(loc: str | None) -> dict[str, Any]:
    """Geocode like the org-duplicate reviewer. Empty loc clears geo fields."""
    from utils.location_parser import parse_address_with_geocodio

    if not (loc or "").strip():
        return {k: None for k in _GEO_FIELDS}

    loc = loc.strip()
    geo = parse_address_with_geocodio(loc)
    municipality = geo.get("municipality")
    province = geo.get("province")
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


def relookup_location_from_description(job: dict, *, dry_run: bool) -> bool:
    """Infer location from the job description, geocode, and update the row."""
    from utils.location_parser import infer_location_string_from_text

    inferred = infer_location_string_from_text(job.get("description"))
    if not inferred:
        print("  could not infer a city from the description.")
        return False

    print(f"  inferred from description: {inferred!r}")
    updates = geocode_location_string(inferred)
    print(
        f"  geo → location={updates.get('location')!r} "
        f"municipality={updates.get('municipality')!r} "
        f"province={updates.get('province')!r} "
        f"lat={updates.get('lat')} lng={updates.get('lng')} "
        f"accuracy={updates.get('geocode_accuracy_type')!r}"
    )

    if dry_run:
        print("  (dry-run — no DB write)")
        job.update(updates)
        return True

    jid = job["id"]
    try:
        supabase.table("jobs").update(updates).eq("id", jid).execute()
    except Exception as exc:
        print(f"  update failed: {exc}")
        return False
    job.update(updates)
    print(f"  updated job {jid}")
    return True


def parse_choice(raw: str, jobs: list[dict]) -> tuple[str, Any]:
    """Return (action, payload).

    keep → single survivor id
    keep_many → list of survivor ids
    relookup → 1-based list index
    skip / quit / invalid
    """
    text = raw.strip()
    if not text:
        return "invalid", None
    lower = text.lower()
    if lower in {"q", "quit"}:
        return "quit", None
    if lower in {"s", "skip"}:
        return "skip", None
    if lower.startswith("l "):
        parts = lower.split()
        if len(parts) != 2 or not parts[1].isdigit():
            return "invalid", None
        n = int(parts[1])
        if not (1 <= n <= len(jobs)):
            return "invalid", None
        return "relookup", n
    if lower.startswith("k "):
        parts = lower.split()[1:]
        if not parts:
            return "invalid", None
        ids: list[str] = []
        seen: set[str] = set()
        for part in parts:
            if not part.isdigit():
                return "invalid", None
            n = int(part)
            if not (1 <= n <= len(jobs)):
                return "invalid", None
            jid = str(jobs[n - 1]["id"])
            if jid not in seen:
                seen.add(jid)
                ids.append(jid)
        if not ids:
            return "invalid", None
        return "keep_many", ids
    if lower.startswith("i ") or lower.startswith("id "):
        parts = text.split(None, 1)
        if len(parts) < 2:
            return "invalid", None
        return "keep", parts[1].strip()
    if lower.isdigit():
        n = int(lower)
        if 1 <= n <= len(jobs):
            return "keep", str(jobs[n - 1]["id"])
        return "invalid", None
    return "invalid", None


def confirm(prompt: str) -> bool:
    try:
        return input(prompt).strip().lower() in {"y", "yes"}
    except EOFError:
        return False


def apply_keep(
    survivor_ids: list[str],
    delete_ids: list[str],
    *,
    dry_run: bool,
) -> None:
    print(f"\n  → keep {survivor_ids}")
    print(f"  → delete {delete_ids}")
    if dry_run:
        print("  (dry-run — no DB writes)")
        return

    for jid in delete_ids:
        try:
            supabase.table("jobs").delete().eq("id", jid).execute()
            print(f"  deleted job {jid}")
        except Exception as exc:
            print(f"  ERROR deleting {jid}: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Interactively review near-duplicate jobs (similar title, close dates, different URLs)."
    )
    parser.add_argument("--prod", action="store_true", help="Use production database.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Walk clusters without deleting.",
    )
    parser.add_argument(
        "--start",
        type=int,
        default=1,
        metavar="N",
        help="1-based cluster index to start at (resume).",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=21,
        metavar="N",
        help="Max days between date_posted values to consider a pair (default 21).",
    )
    parser.add_argument(
        "--lookback",
        type=int,
        default=120,
        metavar="N",
        help="Only consider jobs scraped/posted in the last N days (default 120). Use 0 for all.",
    )
    args = parser.parse_args()

    lookback = None if args.lookback == 0 else args.lookback
    clusters = load_clusters(max_days=args.days, lookback_days=lookback)
    total = len(clusters)
    if total == 0:
        print("No near-duplicate clusters found.")
        return

    start = max(1, min(args.start, total))
    print(f"\n{total} clusters. Starting at {start}.")
    if args.dry_run:
        print("DRY RUN — decisions will not write to the DB.")

    kept = 0
    skipped = 0

    for index in range(start, total + 1):
        cluster = clusters[index - 1]
        # Re-sort in case quality changed (stable suggestion = richest row).
        jobs = sorted(cluster.jobs, key=job_quality_score, reverse=True)
        print_cluster(index, total, NearDupeCluster(cluster.org_key, cluster.org_label, jobs))

        while True:
            try:
                raw = input(f"\n[{index}/{total}] choice > ")
            except EOFError:
                print("\n(end of input)")
                raw = "q"
            action, value = parse_choice(raw, jobs)
            if action == "invalid":
                print("  Invalid. Use 1..N, k 1 2, l N, s, i <uuid>, or q.")
                continue
            if action == "quit":
                print(
                    f"\nStopped at cluster {index}/{total}. "
                    f"resolved={kept} skipped={skipped}. "
                    f"Resume with --start {index}"
                )
                return
            if action == "skip":
                skipped += 1
                print("  skipped.")
                break
            if action == "relookup":
                n = int(value)
                job = jobs[n - 1]
                print(f"  Re-lookup location for [{n}] {job.get('job_title')!r}…")
                relookup_location_from_description(job, dry_run=args.dry_run)
                # Stay on cluster so you can keep after fixing geo.
                print_cluster(index, total, NearDupeCluster(cluster.org_key, cluster.org_label, jobs))
                continue

            if action == "keep":
                survivor_ids = [value]
            else:
                survivor_ids = list(value)
            assert survivor_ids
            ids = {str(j["id"]) for j in jobs}
            if any(sid not in ids for sid in survivor_ids):
                print("  one or more keep ids are not in this cluster.")
                continue
            if len(survivor_ids) >= len(jobs):
                print("  nothing to delete — keeping everyone is a no-op. Use s to skip.")
                continue
            delete_ids = [str(j["id"]) for j in jobs if str(j["id"]) not in set(survivor_ids)]
            for sid in survivor_ids:
                label = next(
                    (j.get("job_title") for j in jobs if str(j["id"]) == sid),
                    sid,
                )
                print(f"  Keep {sid} ({label})")
            print(f"  Delete: {delete_ids}")
            if args.dry_run or confirm("  Apply? [y/N] > "):
                apply_keep(survivor_ids, delete_ids, dry_run=args.dry_run)
                kept += 1
            else:
                print("  not applied — still on this cluster.")
                continue
            break

    print(f"\nDone. resolved={kept} skipped={skipped} of {total}.")


if __name__ == "__main__":
    main()
