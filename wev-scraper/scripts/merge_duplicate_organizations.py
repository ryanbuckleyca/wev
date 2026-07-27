#!/usr/bin/env python
"""Classify and merge duplicate organizations that share a normalized name.

Buckets
-------
auto-merge  same name where every row has a compatible employer evidence domain
review      same name but weak or ambiguous evidence (short acronym, missing domain
            on any row, only shared/social/ATS websites, etc.)
skip        same name with conflicting employer website domains

Merge mechanics (when --apply-auto-merge and not --dry-run, bucket is auto-merge):
  keep survivor A, UPDATE jobs SET organization_id = A WHERE organization_id IN (B, C, …),
  then DELETE the duplicate organization rows.

Usage:
    python scripts/merge_duplicate_organizations.py --dry-run
    python scripts/merge_duplicate_organizations.py --prod --dry-run
    python scripts/merge_duplicate_organizations.py --prod --dry-run --json /tmp/org-dupes.json
    CONFIRM_PROD_RUN=YES python scripts/merge_duplicate_organizations.py --prod --apply-auto-merge
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

# --prod must load .env.production and confirm before utils.db is imported.
from utils.prod_env import bootstrap_prod_from_argv, confirm_prod_run

if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    bootstrap_prod_from_argv(sys.argv[1:], Path(__file__))
    print("Using PRODUCTION database")
else:
    print("Using TEST database")

from utils.db import fetch_all_rows, supabase  # noqa: E402
from utils.organization_cache import employer_apex, evidence_domain, extract_domain  # noqa: E402
from utils.slug import nfkd_to_ascii  # noqa: E402

# Short / acronym-like names need a human look even when websites don't conflict.
_SHORT_NAME_MAX_LEN = 4


@dataclass
class OrgRow:
    id: int
    name: str
    location: str | None
    website: str | None
    slug: str | None
    description: str | None
    job_count: int
    domain: str | None


@dataclass
class ClusterDecision:
    bucket: str  # auto-merge | review | skip
    normalized_name: str
    reason: str
    survivor_id: int
    merge_ids: list[int]
    domains: list[str | None]
    rows: list[dict]


def normalize_name(name: str | None) -> str:
    ascii_str = nfkd_to_ascii(name or "")
    lowered = ascii_str.lower().strip()
    return "".join(
        c for c in lowered if c.isascii() and (c.isalpha() or c.isdigit() or c == " ")
    ).strip()


def _domains_compatible(domains: list[str | None]) -> tuple[bool, str]:
    """Return (compatible, detail). Conflicting evidence domains → not compatible.

    Subdomains of the same apex (``careers.acme.com`` / ``jobs.acme.com`` /
    ``acme.com``) are compatible. Sibling hosts under a public-suffix-like
    parent (``env.gc.ca`` / ``canada.gc.ca``) are not.
    """
    present = [d for d in domains if d]
    if not present:
        return True, "no employer domains set"

    apexes = {employer_apex(d) for d in present}
    if len(apexes) != 1:
        return False, f"conflicting domains: {', '.join(sorted(set(present)))}"

    apex = next(iter(apexes))
    if len(set(present)) == 1:
        return True, f"compatible evidence domain: {apex}"
    return True, f"compatible evidence domains (subdomain-equivalent): {apex}"


def _only_shared_websites(rows: list[OrgRow]) -> bool:
    """True when rows have websites, but none are employer-owned evidence domains."""
    has_website = any((r.website or "").strip() for r in rows)
    has_evidence = any(r.domain for r in rows)
    return has_website and not has_evidence


def _is_short_name(normalized: str) -> bool:
    compact = normalized.replace(" ", "")
    return len(compact) <= _SHORT_NAME_MAX_LEN


def choose_survivor(rows: list[OrgRow]) -> OrgRow:
    """Prefer website, then most jobs, then lowest id."""
    return sorted(
        rows,
        key=lambda r: (
            0 if r.domain else 1,
            -r.job_count,
            r.id,
        ),
    )[0]


def classify_cluster(normalized: str, rows: list[OrgRow]) -> ClusterDecision:
    domains = [r.domain for r in rows]
    compatible, domain_detail = _domains_compatible(domains)
    survivor = choose_survivor(rows)
    merge_ids = sorted(r.id for r in rows if r.id != survivor.id)
    row_dicts = [
        {
            "id": r.id,
            "name": r.name,
            "location": r.location,
            "website": r.website,
            "domain": r.domain,
            "slug": r.slug,
            "job_count": r.job_count,
            "description_preview": (r.description or "")[:120] or None,
        }
        for r in sorted(rows, key=lambda x: x.id)
    ]

    if not compatible:
        return ClusterDecision(
            bucket="skip",
            normalized_name=normalized,
            reason=domain_detail,
            survivor_id=survivor.id,
            merge_ids=merge_ids,
            domains=domains,
            rows=row_dicts,
        )

    if _only_shared_websites(rows):
        shared_hosts = sorted(
            {
                extract_domain(r.website)
                for r in rows
                if extract_domain(r.website)
            }
        )
        return ClusterDecision(
            bucket="review",
            normalized_name=normalized,
            reason=(
                "websites are shared/social/ATS hosts only "
                f"({', '.join(shared_hosts)}); not usable as merge evidence"
            ),
            survivor_id=survivor.id,
            merge_ids=merge_ids,
            domains=domains,
            rows=row_dicts,
        )

    if _is_short_name(normalized):
        return ClusterDecision(
            bucket="review",
            normalized_name=normalized,
            reason=f"short/acronym name ({normalized!r}); {domain_detail}",
            survivor_id=survivor.id,
            merge_ids=merge_ids,
            domains=domains,
            rows=row_dicts,
        )

    # Auto-merge only when every row has compatible employer-domain evidence.
    if not all(domains):
        missing = sum(1 for d in domains if not d)
        return ClusterDecision(
            bucket="review",
            normalized_name=normalized,
            reason=(
                f"{missing} row(s) lack employer domain evidence; "
                "refuse partial-evidence auto-merge"
            ),
            survivor_id=survivor.id,
            merge_ids=merge_ids,
            domains=domains,
            rows=row_dicts,
        )

    return ClusterDecision(
        bucket="auto-merge",
        normalized_name=normalized,
        reason=domain_detail,
        survivor_id=survivor.id,
        merge_ids=merge_ids,
        domains=domains,
        rows=row_dicts,
    )


def _job_counts_for(ids: list[int]) -> dict[int, int]:
    counts: dict[int, int] = {i: 0 for i in ids}
    # PostgREST: count per id; batch with .in_ then group locally is heavier if
    # many jobs — per-id count is fine for ~60 clusters.
    for oid in ids:
        resp = (
            supabase.table("jobs")
            .select("id", count="exact")
            .eq("organization_id", oid)
            .execute()
        )
        counts[oid] = resp.count if resp.count is not None else len(resp.data or [])
    return counts


def build_decisions() -> list[ClusterDecision]:
    print("Fetching organizations...")
    orgs = fetch_all_rows(
        "organizations",
        "id, name, location, website, slug, description",
    )
    print(f"Total organizations: {len(orgs)}")

    groups: dict[str, list[dict]] = defaultdict(list)
    for org in orgs:
        key = normalize_name(org.get("name"))
        if not key:
            continue
        groups[key].append(org)

    dup_groups = {k: v for k, v in groups.items() if len(v) > 1}
    print(f"Duplicate name clusters: {len(dup_groups)}")

    all_ids = [int(o["id"]) for rows in dup_groups.values() for o in rows]
    print(f"Counting jobs for {len(all_ids)} duplicate rows...")
    job_counts = _job_counts_for(all_ids)

    decisions: list[ClusterDecision] = []
    for name, raw_rows in sorted(dup_groups.items()):
        rows = [
            OrgRow(
                id=int(o["id"]),
                name=o.get("name") or "",
                location=o.get("location"),
                website=o.get("website"),
                slug=o.get("slug"),
                description=o.get("description"),
                job_count=job_counts.get(int(o["id"]), 0),
                domain=evidence_domain(o.get("website")),
            )
            for o in raw_rows
        ]
        decisions.append(classify_cluster(name, rows))

    return decisions


def print_report(decisions: list[ClusterDecision]) -> None:
    by_bucket: dict[str, list[ClusterDecision]] = defaultdict(list)
    for d in decisions:
        by_bucket[d.bucket].append(d)

    for bucket in ("auto-merge", "review", "skip"):
        items = by_bucket.get(bucket, [])
        print(f"\n{'=' * 72}")
        print(f"{bucket.upper()} ({len(items)} clusters)")
        print("=" * 72)
        for d in items:
            jobs_moving = sum(
                r["job_count"] for r in d.rows if r["id"] in d.merge_ids
            )
            print(
                f"\n  {d.normalized_name!r}  "
                f"keep={d.survivor_id}  merge={d.merge_ids}  "
                f"jobs_moving={jobs_moving}"
            )
            print(f"    reason: {d.reason}")
            for r in d.rows:
                mark = "KEEP" if r["id"] == d.survivor_id else "merge"
                print(
                    f"    [{mark}] id={r['id']} jobs={r['job_count']} "
                    f"loc={r['location']!r} domain={r['domain']!r}"
                )

    print(f"\nSummary: "
          f"auto-merge={len(by_bucket['auto-merge'])}  "
          f"review={len(by_bucket['review'])}  "
          f"skip={len(by_bucket['skip'])}")


def apply_auto_merges(decisions: list[ClusterDecision]) -> None:
    autos = [d for d in decisions if d.bucket == "auto-merge"]
    if not autos:
        print("No auto-merge clusters to apply.")
        return

    print(f"\nApplying {len(autos)} auto-merge clusters...")
    for d in autos:
        survivor = d.survivor_id
        for merge_id in d.merge_ids:
            try:
                resp = (
                    supabase.table("jobs")
                    .update({"organization_id": survivor})
                    .eq("organization_id", merge_id)
                    .execute()
                )
                n = len(resp.data) if resp.data else 0
                print(f"  jobs {merge_id} → {survivor}: updated {n}")
            except Exception as exc:
                print(f"  ERROR updating jobs {merge_id} → {survivor}: {exc}")
                continue

            try:
                supabase.table("organizations").delete().eq("id", merge_id).execute()
                print(f"  deleted organization {merge_id}")
            except Exception as exc:
                print(f"  ERROR deleting organization {merge_id}: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Classify/merge duplicate organizations by normalized name + website domain."
    )
    parser.add_argument("--prod", action="store_true", help="Use production database.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Classify only; do not update jobs or delete orgs.",
    )
    parser.add_argument(
        "--json",
        metavar="PATH",
        help="Write full classification JSON to PATH.",
    )
    parser.add_argument(
        "--apply-auto-merge",
        action="store_true",
        help="Apply auto-merge bucket (ignored when --dry-run).",
    )
    args = parser.parse_args()

    decisions = build_decisions()
    print_report(decisions)

    if args.json:
        payload = {
            "clusters": [asdict(d) for d in decisions],
            "summary": {
                "auto-merge": sum(1 for d in decisions if d.bucket == "auto-merge"),
                "review": sum(1 for d in decisions if d.bucket == "review"),
                "skip": sum(1 for d in decisions if d.bucket == "skip"),
            },
        }
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        print(f"\nWrote {args.json}")

    if args.dry_run or not args.apply_auto_merge:
        print("\nDRY RUN — no rows modified. "
              "Re-run with --apply-auto-merge (and without --dry-run) to apply auto-merges.")
        return

    apply_auto_merges(decisions)
    print("\nDone.")


if __name__ == "__main__":
    main()
