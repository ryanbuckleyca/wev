#!/usr/bin/env python
"""Dry-run: Cerebras org+job assessment vs prod baselines (last 72h when possible).

Never writes to Supabase.

Usage:
  CONFIRM_PROD_RUN=YES ./venv/bin/python scripts/compare_cerebras_parity.py --prod
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from settings import ensure_env_loaded, load_db_credentials_only  # noqa: E402
from utils.prod_env import (  # noqa: E402
    confirm_prod_run,
    mark_prod_confirmed,
    resolve_prod_env_path,
)

ensure_env_loaded()
if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    mark_prod_confirmed()
    applied = load_db_credentials_only(resolve_prod_env_path(Path(__file__)))
    os.environ["USE_PROD_DB"] = "1"
    os.environ["ENV_MODE"] = "prod"
    print(f"PRODUCTION DB (read-only); keys={', '.join(applied) or '(none)'}")

from llm.openai_compatible import CerebrasProvider  # noqa: E402
from utils.db import reset_supabase_client_cache, supabase  # noqa: E402
from utils.organization_assessment import (  # noqa: E402
    OrganizationAssessor,
    _apply_website_known_guard,
    _attach_org_language,
    _result_to_db_fields,
)
from utils.sse_classifier import SSEClassifier  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("compare_cerebras")

ORG_FIELDS = ("is_sse", "sse_rating", "sector_id", "language", "type")
JOB_FIELDS = ("is_sse", "sse_rating", "language")


def _host(url: str | None) -> str | None:
    if not url:
        return None
    host = (urlparse(url).hostname or "").lower().strip(".")
    return host[4:] if host.startswith("www.") else host or None


def fetch_complete_orgs_72h(limit: int = 8) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=72)).isoformat()
    cols = (
        "id,name,municipality,province,website,description,description_en,"
        "mission_statement,mission_statement_en,sse_rating,is_sse,type,sector_id,"
        "language,values_list,values,sse_details,created_at"
    )
    rows = (
        supabase.table("organizations")
        .select(cols)
        .not_.is_("sse_rating", "null")
        .not_.is_("type", "null")
        .not_.is_("language", "null")
        .not_.is_("is_sse", "null")
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    if rows:
        return rows
    # Fall back to newest complete orgs (any age)
    return (
        supabase.table("organizations")
        .select(cols)
        .not_.is_("sse_rating", "null")
        .not_.is_("type", "null")
        .not_.is_("language", "null")
        .not_.is_("is_sse", "null")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )


def fetch_complete_jobs(limit: int = 8, *, hours: int | None = 72) -> list[dict]:
    q = (
        supabase.table("jobs")
        .select(
            "id,job_title,organization,organization_id,location,municipality,province,"
            "wage,description,summary,sse_rating,is_sse,language,values,listing_url,"
            "date_posted,scraped_at,sse_details"
        )
        .not_.is_("sse_rating", "null")
        .not_.is_("is_sse", "null")
        .not_.is_("language", "null")
        .order("scraped_at", desc=True)
        .limit(limit)
    )
    if hours is not None:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        q = q.gte("scraped_at", cutoff)
    rows = q.execute().data or []
    if rows or hours is None:
        return rows
    # No rated jobs in window — use newest complete rated jobs any age
    return fetch_complete_jobs(limit=limit, hours=None)


def assess_org_with_provider(provider: Any, org: dict) -> dict[str, Any]:
    assessor = OrganizationAssessor.__new__(OrganizationAssessor)
    assessor.provider = provider
    t0 = time.perf_counter()
    try:
        result = assessor.assess(
            raw_name=org["name"],
            municipality=org.get("municipality"),
            province=org.get("province"),
            job_title="",
            description="",
            known_website=org.get("website"),
            existing_description=(
                org.get("description_en") or org.get("description") or ""
            ),
            listing_notes="",
        )
        if result is None:
            return {"error": "assessor returned None", "elapsed_s": round(time.perf_counter() - t0, 2)}
        result = _apply_website_known_guard(result, org.get("website"))
        updates = _result_to_db_fields(result)
        row = _attach_org_language(
            {"name": org["name"], "language": None, **updates, "website": updates.get("website")},
            result.get("public_language"),
            force_lang=True,
        )
        return {
            "is_sse": row.get("is_sse"),
            "sse_rating": row.get("sse_rating"),
            "sector_id": row.get("sector_id"),
            "language": row.get("language"),
            "type": row.get("type"),
            "website": row.get("website"),
            "website_norm": _host(row.get("website")),
            "elapsed_s": round(time.perf_counter() - t0, 2),
            "error": None,
        }
    except Exception as exc:
        return {"error": str(exc), "elapsed_s": round(time.perf_counter() - t0, 2)}


def classify_job_with_provider(provider: Any, job: dict) -> dict[str, Any]:
    clf = SSEClassifier.__new__(SSEClassifier)
    clf.provider = provider
    t0 = time.perf_counter()
    try:
        result = clf.classify_job(
            {
                "organization": job.get("organization") or "",
                "job_title": job.get("job_title") or "",
                "location": job.get("location") or "",
                "salary": job.get("wage") or "Not specified",
                "description": job.get("description") or "",
                "posted_date": str(job.get("date_posted") or ""),
            }
        )
        rating = result.get("rating") if isinstance(result, dict) else getattr(result, "rating", None)
        return {
            "is_sse": rating in ("strong_yes", "weak_yes") if rating else None,
            "sse_rating": rating,
            "language": None,
            "elapsed_s": round(time.perf_counter() - t0, 2),
            "error": None,
        }
    except Exception as exc:
        return {"error": str(exc), "elapsed_s": round(time.perf_counter() - t0, 2)}


def compare(ref: dict, cand: dict, fields: tuple[str, ...]) -> dict:
    out = {}
    for f in fields:
        if f == "language" and cand.get(f) is None and ref.get(f) is not None:
            continue  # job path often skips language
        rv, cv = ref.get(f), cand.get(f)
        out[f] = {"match": rv == cv, "prod": rv, "cerebras": cv}
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod", action="store_true")
    parser.add_argument("--org-limit", type=int, default=6)
    parser.add_argument("--job-limit", type=int, default=6)
    args = parser.parse_args()

    reset_supabase_client_cache()
    provider = CerebrasProvider()
    if not provider.is_available():
        raise SystemExit("Cerebras unavailable — set CEREBRAS_API_KEY in .env")

    print(f"Cerebras model={provider._model}")
    orgs = fetch_complete_orgs_72h(limit=args.org_limit)
    jobs = fetch_complete_jobs(limit=args.job_limit, hours=72)
    print(f"Sampled {len(orgs)} complete orgs (72h) and {len(jobs)} complete jobs")

    org_reports = []
    for i, org in enumerate(orgs):
        if i:
            time.sleep(15)  # respect Cerebras free-tier TPM between large prompts
        print(f"\n=== ORG {org['id']} {org['name']} ===")
        print(
            f"  prod: is_sse={org.get('is_sse')} rating={org.get('sse_rating')} "
            f"sector={org.get('sector_id')} lang={org.get('language')} type={org.get('type')}"
        )
        cand = assess_org_with_provider(provider, org)
        if cand.get("error"):
            print(f"  ERROR: {cand['error']}")
        else:
            print(
                f"  cerebras: is_sse={cand.get('is_sse')} rating={cand.get('sse_rating')} "
                f"sector={cand.get('sector_id')} lang={cand.get('language')} type={cand.get('type')} "
                f"({cand.get('elapsed_s')}s)"
            )
        cmp = compare(org, cand, ORG_FIELDS) if not cand.get("error") else {}
        misses = [f for f, c in cmp.items() if not c["match"]]
        print(f"  misses: {misses or 'NONE'}")
        org_reports.append({"org_id": org["id"], "name": org["name"], "prod": {k: org.get(k) for k in ORG_FIELDS}, "cerebras": cand, "compare": cmp})

    job_reports = []
    for i, job in enumerate(jobs):
        if i or orgs:
            time.sleep(10)
        title = job.get("job_title") or "?"
        print(f"\n=== JOB {job['id'][:8]} {title[:50]} @ {job.get('organization')} ===")
        print(
            f"  prod: is_sse={job.get('is_sse')} rating={job.get('sse_rating')} lang={job.get('language')}"
        )
        cand = classify_job_with_provider(provider, job)
        if cand.get("error"):
            print(f"  ERROR: {cand['error']}")
        else:
            print(
                f"  cerebras: is_sse={cand.get('is_sse')} rating={cand.get('sse_rating')} "
                f"({cand.get('elapsed_s')}s)"
            )
        cmp = compare(job, cand, ("is_sse", "sse_rating")) if not cand.get("error") else {}
        misses = [f for f, c in cmp.items() if not c["match"]]
        print(f"  misses: {misses or 'NONE'}")
        job_reports.append(
            {
                "job_id": job["id"],
                "title": title,
                "organization": job.get("organization"),
                "prod": {k: job.get(k) for k in JOB_FIELDS},
                "cerebras": cand,
                "compare": cmp,
            }
        )

    def accuracy(reports: list[dict], fields: tuple[str, ...]) -> dict:
        stats = {f: {"matches": 0, "total": 0} for f in fields}
        for r in reports:
            for f, cell in (r.get("compare") or {}).items():
                if f not in stats:
                    continue
                stats[f]["total"] += 1
                if cell.get("match"):
                    stats[f]["matches"] += 1
        return {
            f: {
                **v,
                "pct": round(100.0 * v["matches"] / v["total"], 1) if v["total"] else None,
            }
            for f, v in stats.items()
        }

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provider": "cerebras",
        "model": provider._model,
        "org_accuracy": accuracy(org_reports, ORG_FIELDS),
        "job_accuracy": accuracy(job_reports, ("is_sse", "sse_rating")),
        "orgs": org_reports,
        "jobs": job_reports,
    }
    out = Path(__file__).resolve().parent / "cerebras_parity_72h.json"
    out.write_text(json.dumps(summary, indent=2, default=str))
    print("\n======== SUMMARY ========")
    print("ORG accuracy:", json.dumps(summary["org_accuracy"], indent=2))
    print("JOB accuracy:", json.dumps(summary["job_accuracy"], indent=2))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
