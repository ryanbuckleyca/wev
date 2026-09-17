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
    python -m scripts.merge_duplicate_organizations --dry-run
    python -m scripts.merge_duplicate_organizations --prod --dry-run
    python -m scripts.merge_duplicate_organizations --prod --dry-run --needs-review
    python -m scripts.merge_duplicate_organizations --prod --dry-run --needs-review --interactive
    python -m scripts.merge_duplicate_organizations --prod --dry-run --limit 5
    python -m scripts.merge_duplicate_organizations --prod --dry-run --json /tmp/org-dupes.json
    CONFIRM_PROD_RUN=YES python -m scripts.merge_duplicate_organizations --prod --apply-auto-merge
"""

from __future__ import annotations

import argparse
import json
import re
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
# Near-match (name + trailing city) requires this many shared leading words.
_MIN_CORE_WORDS = 2


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
    alternative_names: list[str] | None = None


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
    """Lowercase ASCII name with punctuation/hyphens treated as word breaks.

    ``Community-University Television`` and ``Community University Television``
    share the same key. Accents are folded via NFKD.
    """
    ascii_str = nfkd_to_ascii(name or "")
    lowered = ascii_str.lower().strip()
    spaced = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", spaced).strip()


def _location_tokens(*parts: str | None) -> set[str]:
    """Token set from municipality / province / free-text location fields."""
    tokens: set[str] = set()
    for part in parts:
        for tok in normalize_name(part).split():
            tokens.add(tok)
    return tokens


def is_location_suffix_variant(
    name_a: str,
    loc_tokens_a: set[str],
    name_b: str,
    loc_tokens_b: set[str],
) -> bool:
    """True when one name is the other plus trailing tokens from its own location.

    Example: ``Community-University Television`` vs
    ``Community University Television Montreal`` (Montreal in location).
    """
    wa = normalize_name(name_a).split()
    wb = normalize_name(name_b).split()
    if not wa or not wb or wa == wb:
        return False
    if len(wa) == len(wb):
        return False

    if len(wa) < len(wb):
        shorter, longer, longer_locs = wa, wb, loc_tokens_b
    else:
        shorter, longer, longer_locs = wb, wa, loc_tokens_a

    if len(shorter) < _MIN_CORE_WORDS:
        return False
    if longer[: len(shorter)] != shorter:
        return False
    suffix = longer[len(shorter) :]
    return bool(suffix) and all(tok in longer_locs for tok in suffix)


def locations_compatible(
    municipality_a: str | None,
    municipality_b: str | None,
    *,
    location_a: str | None = None,
    location_b: str | None = None,
) -> bool:
    """Same city when both known; otherwise allow (one missing / overlapping tokens)."""
    ma = normalize_name(municipality_a)
    mb = normalize_name(municipality_b)
    if ma and mb:
        return ma == mb
    # Fall back to free-text location overlap when municipality is sparse.
    if ma or mb:
        known = ma or mb
        other_loc = normalize_name(location_b if ma else location_a)
        return (not other_loc) or known in other_loc.split() or known in other_loc
    ta = _location_tokens(location_a)
    tb = _location_tokens(location_b)
    if not ta or not tb:
        return True
    return bool(ta & tb)


class _UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, i: int) -> int:
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, i: int, j: int) -> None:
        ri, rj = self.find(i), self.find(j)
        if ri != rj:
            self.parent[rj] = ri


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


def classify_cluster(
    normalized: str,
    rows: list[OrgRow],
    *,
    near_match: bool = False,
) -> ClusterDecision:
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
            "alternative_names": list(r.alternative_names or []),
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

    if near_match:
        names = sorted({r.name for r in rows})
        return ClusterDecision(
            bucket="review",
            normalized_name=normalized,
            reason=(
                "near-match names (punctuation/location suffix variant): "
                + " / ".join(names)
                + f"; {domain_detail}"
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


def _cluster_organizations(orgs: list[dict]) -> list[tuple[str, list[dict], bool]]:
    """Group orgs by exact normalized name, then link location-suffix near-matches.

    Returns list of (label, rows, near_match).
    """
    n = len(orgs)
    uf = _UnionFind(n)
    norms = [normalize_name(o.get("name")) for o in orgs]
    loc_toks = [
        _location_tokens(o.get("municipality"), o.get("province"), o.get("location"))
        for o in orgs
    ]

    # Exact normalized-name clusters
    by_norm: dict[str, list[int]] = defaultdict(list)
    for i, key in enumerate(norms):
        if key:
            by_norm[key].append(i)
    for idxs in by_norm.values():
        for j in idxs[1:]:
            uf.union(idxs[0], j)

    # Near-match: one name is the other + trailing city/location tokens
    # Only compare across different exact keys to avoid O(n²) within a twin set.
    key_reps = {key: idxs[0] for key, idxs in by_norm.items() if key}
    keys = sorted(key_reps)
    for i, key_a in enumerate(keys):
        ia = key_reps[key_a]
        for key_b in keys[i + 1 :]:
            ib = key_reps[key_b]
            # Cheap filter: one key must be a prefix of the other (word-wise).
            wa, wb = key_a.split(), key_b.split()
            if len(wa) == len(wb):
                continue
            shorter, longer = (wa, wb) if len(wa) < len(wb) else (wb, wa)
            if len(shorter) < _MIN_CORE_WORDS or longer[: len(shorter)] != shorter:
                continue
            oa, ob = orgs[ia], orgs[ib]
            if not locations_compatible(
                oa.get("municipality"),
                ob.get("municipality"),
                location_a=oa.get("location"),
                location_b=ob.get("location"),
            ):
                continue
            if is_location_suffix_variant(
                oa.get("name") or "",
                loc_toks[ia],
                ob.get("name") or "",
                loc_toks[ib],
            ):
                uf.union(ia, ib)

    clusters: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        if not norms[i]:
            continue
        clusters[uf.find(i)].append(i)

    result: list[tuple[str, list[dict], bool]] = []
    for idxs in clusters.values():
        if len(idxs) < 2:
            continue
        rows = [orgs[i] for i in idxs]
        keys_in = {norms[i] for i in idxs}
        near = len(keys_in) > 1
        # Prefer the shortest normalized key as the cluster label.
        label = min(keys_in, key=lambda k: (len(k.split()), k))
        result.append((label, rows, near))
    return result


def build_decisions(*, limit: int | None = None) -> list[ClusterDecision]:
    print("Fetching organizations...")
    orgs = fetch_all_rows(
        "organizations",
        "id, name, location, website, slug, description, municipality, province, alternative_names",
    )
    print(f"Total organizations: {len(orgs)}")

    clustered = _cluster_organizations(orgs)
    print(f"Duplicate name clusters: {len(clustered)}")

    cluster_items = sorted(clustered, key=lambda item: item[0])
    if limit is not None:
        cluster_items = cluster_items[: max(0, limit)]
        print(f"Limiting to first {len(cluster_items)} cluster(s) (--limit={limit})")

    all_ids = [int(o["id"]) for _, rows, _ in cluster_items for o in rows]
    print(f"Counting jobs for {len(all_ids)} duplicate rows...")
    job_counts = _job_counts_for(all_ids)

    decisions: list[ClusterDecision] = []
    for name, raw_rows, near_match in cluster_items:
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
                alternative_names=list(o.get("alternative_names") or []),
            )
            for o in raw_rows
        ]
        decisions.append(classify_cluster(name, rows, near_match=near_match))

    return decisions


def print_report(
    decisions: list[ClusterDecision],
    *,
    buckets: tuple[str, ...] | None = None,
) -> None:
    """Print clusters to the terminal.

    When *buckets* is set, only those buckets are listed (summary still covers all).
    """
    by_bucket: dict[str, list[ClusterDecision]] = defaultdict(list)
    for d in decisions:
        by_bucket[d.bucket].append(d)

    show = buckets or ("auto-merge", "review", "skip")
    for bucket in show:
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
                    f"name={r.get('name')!r}"
                )
                print(
                    f"           loc={r.get('location')!r} "
                    f"domain={r.get('domain')!r} "
                    f"slug={r.get('slug')!r}"
                )
                print(f"           website={r.get('website')!r}")

    print(
        f"\nSummary: "
        f"auto-merge={len(by_bucket['auto-merge'])}  "
        f"review={len(by_bucket['review'])}  "
        f"skip={len(by_bucket['skip'])}"
    )
    if buckets:
        shown = sum(len(by_bucket[b]) for b in buckets)
        print(f"Showing {shown} cluster(s) in buckets: {', '.join(buckets)}")


def review_interactively(decisions: list[ClusterDecision]) -> None:
    """Walk review/skip clusters one at a time in the terminal."""
    todo = [d for d in decisions if d.bucket in ("review", "skip")]
    if not todo:
        print("\nNo review/skip clusters to walk through.")
        return

    print(
        f"\nInteractive review: {len(todo)} cluster(s) that cannot auto-merge.\n"
        "Press Enter for next, or q then Enter to quit.\n"
    )
    for i, d in enumerate(todo, 1):
        print(f"\n{'─' * 72}")
        print(f"[{i}/{len(todo)}] {d.bucket.upper()} — {d.normalized_name!r}")
        print(f"reason: {d.reason}")
        print(f"suggested keep={d.survivor_id}  merge={d.merge_ids}")
        for r in d.rows:
            mark = "KEEP" if r["id"] == d.survivor_id else "merge"
            print(
                f"  [{mark}] id={r['id']} jobs={r['job_count']} "
                f"name={r.get('name')!r}"
            )
            print(
                f"         loc={r.get('location')!r} domain={r.get('domain')!r} "
                f"slug={r.get('slug')!r}"
            )
            print(f"         website={r.get('website')!r}")
        try:
            reply = input("\n[Enter]=next  q=quit > ").strip().lower()
        except EOFError:
            print("\n(end of input)")
            break
        if reply in {"q", "quit"}:
            print(f"Stopped at {i}/{len(todo)}.")
            break
    else:
        print(f"\nDone — reviewed all {len(todo)} cluster(s).")


def apply_auto_merges(decisions: list[ClusterDecision]) -> None:
    from utils.organization_cache import merge_alternative_names

    autos = [d for d in decisions if d.bucket == "auto-merge"]
    if not autos:
        print("No auto-merge clusters to apply.")
        return

    print(f"\nApplying {len(autos)} auto-merge clusters...")
    for d in autos:
        survivor = d.survivor_id
        deleted_ids: list[int] = []

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
                deleted_ids.append(merge_id)
            except Exception as exc:
                print(f"  ERROR deleting organization {merge_id}: {exc}")

        if not deleted_ids:
            continue

        # Promote absorbed names only after those orgs were actually deleted,
        # so a failed job reassign cannot leave two live orgs sharing a name.
        try:
            resp = (
                supabase.table("organizations")
                .select("id, name, alternative_names")
                .eq("id", survivor)
                .limit(1)
                .execute()
            )
            survivor_row = (resp.data or [{}])[0] or {
                "name": "",
                "alternative_names": [],
            }
            # Prefer pre-delete payloads (include absorbed alternative_names).
            absorbed = [
                next(
                    (r for r in d.rows if r.get("id") == mid),
                    {"name": None, "alternative_names": []},
                )
                for mid in deleted_ids
            ]
            new_alts = merge_alternative_names(
                survivor_row.get("name") or "",
                survivor_row.get("alternative_names"),
                absorbed,
            )
            if new_alts != list(survivor_row.get("alternative_names") or []):
                supabase.table("organizations").update(
                    {"alternative_names": new_alts}
                ).eq("id", survivor).execute()
                print(f"  survivor {survivor} alternative_names → {new_alts}")
        except Exception as exc:
            print(f"  WARNING: alternative_names promote failed for {survivor}: {exc}")


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
        "--needs-review",
        action="store_true",
        help="Only print review/skip clusters (ones that cannot auto-merge).",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Walk review/skip clusters one at a time in the terminal.",
    )
    parser.add_argument(
        "--apply-auto-merge",
        action="store_true",
        help="Apply auto-merge bucket (ignored when --dry-run).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Only classify/apply the first N duplicate-name clusters (sorted by name).",
    )
    args = parser.parse_args()

    decisions = build_decisions(limit=args.limit)
    buckets = ("review", "skip") if args.needs_review else None
    if args.interactive:
        # Interactive walk already focuses on review/skip; skip the full dump.
        by_bucket: dict[str, list[ClusterDecision]] = defaultdict(list)
        for d in decisions:
            by_bucket[d.bucket].append(d)
        print(
            f"Summary: "
            f"auto-merge={len(by_bucket['auto-merge'])}  "
            f"review={len(by_bucket['review'])}  "
            f"skip={len(by_bucket['skip'])}"
        )
        review_interactively(decisions)
    else:
        print_report(decisions, buckets=buckets)

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
