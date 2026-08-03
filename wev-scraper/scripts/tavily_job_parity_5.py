#!/usr/bin/env python
"""Dry-run: re-classify 5 recent completed jobs with Tavily-always grounding.

Compares prod job SSE fields vs a re-run through the current SSE fallback
chain (gemini → groq → cerebras) with shared Tavily evidence forced ON.

Current stock ``SSEClassifier.classify_job`` skips Tavily when a posting
description exists (``use_grounding=not has_description``). This script
forces grounding for every job so we can measure consistency of the
tavily-always approach the branch is moving toward.

Never writes to Supabase.

Usage:
  CONFIRM_PROD_RUN=YES ./venv/bin/python scripts/tavily_job_parity_5.py --prod
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from settings import ensure_env_loaded, load_db_credentials_only  # noqa: E402
from utils.prod_env import (  # noqa: E402
    confirm_prod_run,
    mark_prod_confirmed,
    resolve_prod_env_path,
)

LOG_PATH = Path("/tmp/tavily_job_parity_5.log")
REPORT_MD = _ROOT / "scripts" / "tavily_job_parity_5.md"
REPORT_JSON = _ROOT / "scripts" / "tavily_job_parity_5.json"

# Structural fields expected to stay stable across re-runs
STABLE_FIELDS = ("sse_rating", "is_sse")
# Narrative fields that may drift
NARRATIVE_FIELDS = ("confidence", "reasoning", "must_haves_met", "nice_to_haves_met", "flags")

ensure_env_loaded()
if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=False)
    mark_prod_confirmed()
    applied = load_db_credentials_only(resolve_prod_env_path(Path(__file__)))
    os.environ["USE_PROD_DB"] = "1"
    # Keep LLM keys from .env; only swap DB target
    print(f"PRODUCTION DB (read-only); keys={', '.join(applied) or '(none)'}")

from llm.tavily_grounding import (  # noqa: E402
    entity_require_terms,
    is_tavily_available,
    require_tavily,
)
from utils.db import reset_supabase_client_cache, supabase  # noqa: E402
from utils.sse_classifier import SSEClassifier, SSEClassificationError  # noqa: E402
from utils.sse_prompts import get_sse_classification_prompt  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_PATH, mode="w"),
    ],
)
logger = logging.getLogger("tavily_job_parity")


JOB_SELECT = (
    "id,job_title,organization,organization_id,location,municipality,province,"
    "wage,description,summary,sse_rating,is_sse,language,values,listing_url,"
    "date_posted,scraped_at,sse_details"
)


def fetch_completed_jobs_last_week(limit: int = 5) -> list[dict]:
    """Prefer jobs scraped in the last 7 days with complete SSE fields."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    base = (
        supabase.table("jobs")
        .select(JOB_SELECT)
        .not_.is_("sse_rating", "null")
        .not_.is_("is_sse", "null")
        .not_.is_("description", "null")
    )

    rows = (
        base.gte("scraped_at", cutoff)
        .order("scraped_at", desc=True)
        .limit(60)
        .execute()
        .data
        or []
    )

    if not rows:
        logger.warning("No rated jobs in last 7d — falling back to newest complete jobs")
        rows = (
            supabase.table("jobs")
            .select(JOB_SELECT)
            .not_.is_("sse_rating", "null")
            .not_.is_("is_sse", "null")
            .order("scraped_at", desc=True)
            .limit(60)
            .execute()
            .data
            or []
        )

    # Prefer variety: mix ratings and orgs
    return _pick_varied(rows, limit)


def _pick_varied(rows: list[dict], limit: int) -> list[dict]:
    """Prefer distinct orgs and a mix of sse_rating values when available."""
    by_rating: dict[str, list[dict]] = {}
    for row in rows:
        desc = (row.get("description") or "").strip()
        if len(desc) < 80:
            continue
        rating = (row.get("sse_rating") or "unknown").strip().lower()
        by_rating.setdefault(rating, []).append(row)

    picked: list[dict] = []
    seen_orgs: set[str] = set()
    seen_ids: set[str] = set()

    # Round-robin across ratings for variety
    rating_keys = sorted(by_rating.keys())
    while len(picked) < limit and any(by_rating.values()):
        progress = False
        for rating in rating_keys:
            bucket = by_rating.get(rating) or []
            while bucket:
                row = bucket.pop(0)
                org = (row.get("organization") or "").strip().lower()
                if row["id"] in seen_ids:
                    continue
                if org in seen_orgs and len(picked) < limit - 1:
                    # Prefer new orgs until near the end
                    continue
                picked.append(row)
                seen_ids.add(row["id"])
                seen_orgs.add(org)
                progress = True
                break
            if len(picked) >= limit:
                break
        if not progress:
            # Relax org uniqueness
            for rating in rating_keys:
                for row in list(by_rating.get(rating) or []):
                    if row["id"] in seen_ids:
                        continue
                    picked.append(row)
                    seen_ids.add(row["id"])
                    if len(picked) >= limit:
                        return picked
            break

    return picked[:limit]


def classify_job_tavily_always(clf: SSEClassifier, job: dict) -> dict[str, Any]:
    """Classify with Tavily grounding always on (shared evidence + require_tavily)."""
    org_name = job.get("organization") or job.get("org_name") or "Unknown"
    job_title = job.get("job_title") or job.get("title") or "Unknown"
    location = job.get("location") or "Unknown"
    salary = job.get("wage") or job.get("salary") or "Not specified"
    description = (job.get("description") or "").strip()
    posted_date = str(job.get("date_posted") or datetime.now(timezone.utc).isoformat())
    listing_url = job.get("listing_url") or ""

    if not description:
        raise SSEClassificationError("Job description required for parity re-run")

    prompt = get_sse_classification_prompt(
        org_name=org_name,
        job_title=job_title,
        location=location,
        salary=salary,
        job_description=description,
        posted_date=posted_date,
    )

    search_terms = f'"{org_name}"'
    if location and location != "Unknown":
        search_terms += f' "{location}"'
    search_query = f"{search_terms} official website mission governance"
    require_terms = entity_require_terms(org_name) or None

    t0 = time.perf_counter()
    last_error = ""
    for attempt in range(2):
        try:
            response_text = clf._call_provider_with_retry(
                provider=clf.provider,
                prompt=prompt,
                system=(
                    "You are an expert at analyzing job postings for Solidarity "
                    "Economy alignment. Score the role from the posting body. "
                    "Do not invent a different employer from search. Supporting "
                    "web evidence (Tavily) may clarify employer identity / mission "
                    "but must not override clear posting facts."
                ),
                task="sse",
                search_query=search_query,
                retries=0,
                require_terms=require_terms,
                use_grounding=True,  # tavily-always
            )
        except SSEClassificationError as exc:
            last_error = str(exc)
            logger.warning("provider error attempt %d/2: %s", attempt + 1, last_error)
            continue

        parsed, parse_error = clf._safe_parse_sse_response(
            response_text, job_title, org_name
        )
        if parsed is not None:
            rating = parsed["rating"]
            provider_name = getattr(clf.provider, "current_model", None) or getattr(
                clf.provider, "_last_successful", None
            )
            return {
                "sse_rating": rating,
                "is_sse": rating in ("strong_yes", "weak_yes"),
                "confidence": parsed.get("confidence"),
                "reasoning": parsed.get("reasoning"),
                "must_haves_met": parsed.get("must_haves_met") or [],
                "nice_to_haves_met": parsed.get("nice_to_haves_met") or [],
                "flags": parsed.get("flags") or [],
                "classified_at": parsed.get("classified_at"),
                "provider": provider_name,
                "listing_url": listing_url,
                "search_query": search_query,
                "tavily_always": True,
                "elapsed_s": round(time.perf_counter() - t0, 2),
                "error": None,
            }
        last_error = parse_error or "parse error"
        logger.warning("parse error attempt %d/2: %s", attempt + 1, last_error)

    return {
        "error": last_error or "classification failed",
        "elapsed_s": round(time.perf_counter() - t0, 2),
        "tavily_always": True,
    }


def _prod_snapshot(job: dict) -> dict[str, Any]:
    details = job.get("sse_details") or {}
    if isinstance(details, str):
        try:
            details = json.loads(details)
        except json.JSONDecodeError:
            details = {"raw": details}
    return {
        "id": job.get("id"),
        "job_title": job.get("job_title"),
        "organization": job.get("organization"),
        "organization_id": job.get("organization_id"),
        "location": job.get("location"),
        "municipality": job.get("municipality"),
        "province": job.get("province"),
        "wage": job.get("wage"),
        "listing_url": job.get("listing_url"),
        "date_posted": job.get("date_posted"),
        "scraped_at": job.get("scraped_at"),
        "language": job.get("language"),
        "sse_rating": job.get("sse_rating"),
        "is_sse": job.get("is_sse"),
        "summary": (job.get("summary") or "")[:500],
        "description_len": len(job.get("description") or ""),
        "description_preview": (job.get("description") or "")[:400],
        "sse_details": {
            "confidence": details.get("confidence") if isinstance(details, dict) else None,
            "reasoning": details.get("reasoning") if isinstance(details, dict) else None,
            "must_haves_met": details.get("must_haves_met") if isinstance(details, dict) else None,
            "nice_to_haves_met": details.get("nice_to_haves_met") if isinstance(details, dict) else None,
            "flags": details.get("flags") if isinstance(details, dict) else None,
            "classified_at": details.get("classified_at") if isinstance(details, dict) else None,
        },
    }


def _compare(prod: dict, rerun: dict) -> dict[str, Any]:
    out: dict[str, Any] = {"stable": {}, "narrative": {}, "stable_all_match": True}
    for f in STABLE_FIELDS:
        pv, rv = prod.get(f), rerun.get(f)
        match = pv == rv
        out["stable"][f] = {"match": match, "prod": pv, "rerun": rv}
        if not match:
            out["stable_all_match"] = False

    details = prod.get("sse_details") or {}
    for f in NARRATIVE_FIELDS:
        pv = details.get(f) if isinstance(details, dict) else None
        rv = rerun.get(f)
        if f in ("must_haves_met", "nice_to_haves_met", "flags"):
            ps = set(pv or []) if isinstance(pv, list) else set()
            rs = set(rv or []) if isinstance(rv, list) else set()
            out["narrative"][f] = {
                "exact_match": pv == rv,
                "overlap": sorted(ps & rs),
                "prod_only": sorted(ps - rs),
                "rerun_only": sorted(rs - ps),
                "prod": pv,
                "rerun": rv,
            }
        elif f == "confidence":
            try:
                diff = abs(float(pv or 0) - float(rv or 0))
            except (TypeError, ValueError):
                diff = None
            out["narrative"][f] = {
                "match": pv == rv,
                "abs_diff": diff,
                "prod": pv,
                "rerun": rv,
            }
        else:
            out["narrative"][f] = {
                "match": (pv or "") == (rv or ""),
                "prod": pv,
                "rerun": rv,
            }
    return out


def _md_escape(text: Any, limit: int = 600) -> str:
    s = str(text or "").replace("\n", " ").strip()
    if len(s) > limit:
        return s[: limit - 3] + "..."
    return s


def write_report(payload: dict) -> None:
    lines: list[str] = []
    lines.append("# Tavily-always job parity (5 jobs)")
    lines.append("")
    lines.append(f"Generated: `{payload['generated_at']}`")
    lines.append("")
    lines.append("## What “tavily-always” means here")
    lines.append("")
    lines.append(
        "- Org assessment / SSE fallback: when grounding is requested, "
        "`SSEFallbackProvider.complete` calls `require_tavily()` then "
        "`fetch_tavily_context` once and injects the **same** evidence into "
        "every backend (gemini → groq → cerebras)."
    )
    lines.append(
        "- Stock `SSEClassifier.classify_job` currently sets "
        "`use_grounding=not has_description` (Tavily **off** when a posting "
        "body exists)."
    )
    lines.append(
        "- This parity run **forces** `use_grounding=True` + employer search "
        "query for every job (tavily-always), dry-run only — no DB writes."
    )
    lines.append("")
    lines.append("## Headline")
    lines.append("")
    lines.append(payload["headline"])
    lines.append("")
    lines.append("## Summary table")
    lines.append("")
    lines.append("| # | Job | Org | Prod rating | Re-run | Stable match | Elapsed | Notes |")
    lines.append("|---|-----|-----|-------------|--------|--------------|---------|-------|")
    for i, row in enumerate(payload["jobs"], 1):
        cmp = row.get("compare") or {}
        stable_ok = cmp.get("stable_all_match")
        err = (row.get("rerun") or {}).get("error")
        note = err or ("OK" if stable_ok else "RATING DRIFT")
        lines.append(
            f"| {i} | {_md_escape(row.get('title'), 40)} | "
            f"{_md_escape(row.get('organization'), 30)} | "
            f"`{(row.get('prod') or {}).get('sse_rating')}` | "
            f"`{(row.get('rerun') or {}).get('sse_rating')}` | "
            f"{'yes' if stable_ok else 'NO'} | "
            f"{(row.get('rerun') or {}).get('elapsed_s', '—')}s | "
            f"{_md_escape(note, 50)} |"
        )
    lines.append("")
    lines.append("### Structural vs narrative")
    lines.append("")
    lines.append(
        "- **Structural (expect stable):** `sse_rating`, `is_sse` — "
        "these drive filters/matching."
    )
    lines.append(
        "- **Narrative (may drift):** `reasoning`, `must_haves_met`, "
        "`nice_to_haves_met`, `flags`, `confidence` — LLM prose/lists."
    )
    lines.append(
        "- **Out of scope for this classify path:** `language`, `type`, "
        "org mission/website (those come from org assessment / other steps)."
    )
    lines.append("")

    for i, row in enumerate(payload["jobs"], 1):
        prod = row.get("prod") or {}
        rerun = row.get("rerun") or {}
        cmp = row.get("compare") or {}
        lines.append(f"## Job {i}: `{prod.get('id')}`")
        lines.append("")
        lines.append(f"- **Title:** {prod.get('job_title')}")
        lines.append(f"- **Org:** {prod.get('organization')} (org_id={prod.get('organization_id')})")
        lines.append(f"- **Location:** {prod.get('location')}")
        lines.append(f"- **Listing:** {prod.get('listing_url')}")
        lines.append(f"- **Updated:** scraped {prod.get('scraped_at')} · classified {(prod.get('sse_details') or {}).get('classified_at')}")
        lines.append(f"- **Description length:** {prod.get('description_len')} chars")
        lines.append("")
        lines.append("### Side-by-side")
        lines.append("")
        lines.append("| Field | Prod | Re-run (tavily-always) |")
        lines.append("|-------|------|------------------------|")
        for f in STABLE_FIELDS:
            cell = (cmp.get("stable") or {}).get(f) or {}
            mark = "✓" if cell.get("match") else "✗"
            lines.append(
                f"| {mark} `{f}` | `{cell.get('prod')}` | `{cell.get('rerun')}` |"
            )
        conf = (cmp.get("narrative") or {}).get("confidence") or {}
        lines.append(
            f"| confidence | `{conf.get('prod')}` | `{conf.get('rerun')}` "
            f"(Δ={conf.get('abs_diff')}) |"
        )
        lines.append(
            f"| provider | — | `{rerun.get('provider')}` |"
        )
        lines.append("")
        if rerun.get("error"):
            lines.append(f"**ERROR:** `{_md_escape(rerun.get('error'), 400)}`")
            lines.append("")
        lines.append("**Prod reasoning:** " + _md_escape((prod.get("sse_details") or {}).get("reasoning"), 800))
        lines.append("")
        lines.append("**Re-run reasoning:** " + _md_escape(rerun.get("reasoning"), 800))
        lines.append("")
        mh = (cmp.get("narrative") or {}).get("must_haves_met") or {}
        lines.append(
            f"- must_haves overlap: {mh.get('overlap')} · "
            f"prod_only={mh.get('prod_only')} · rerun_only={mh.get('rerun_only')}"
        )
        fl = (cmp.get("narrative") or {}).get("flags") or {}
        lines.append(
            f"- flags overlap: {fl.get('overlap')} · "
            f"prod_only={fl.get('prod_only')} · rerun_only={fl.get('rerun_only')}"
        )
        lines.append("")
        lines.append("### Diff notes")
        lines.append("")
        notes = row.get("diff_notes") or []
        if notes:
            for n in notes:
                lines.append(f"- {n}")
        else:
            lines.append("- (none)")
        lines.append("")

    lines.append("## Failures / infra")
    lines.append("")
    fails = payload.get("failures") or []
    if fails:
        for f in fails:
            lines.append(f"- {f}")
    else:
        lines.append("- None observed (Tavily available, no hard aborts).")
    lines.append("")
    lines.append(f"Log: `{LOG_PATH}`")
    lines.append(f"JSON: `{REPORT_JSON}`")
    lines.append("")

    REPORT_MD.write_text("\n".join(lines) + "\n")
    REPORT_JSON.write_text(json.dumps(payload, indent=2, default=str) + "\n")
    logger.info("Wrote %s and %s", REPORT_MD, REPORT_JSON)


def _diff_notes(prod: dict, rerun: dict, cmp: dict) -> list[str]:
    notes: list[str] = []
    if rerun.get("error"):
        notes.append(f"Re-run failed: {rerun['error']}")
        return notes
    for f, cell in (cmp.get("stable") or {}).items():
        if not cell.get("match"):
            notes.append(
                f"Structural drift on `{f}`: prod={cell.get('prod')} → "
                f"rerun={cell.get('rerun')}"
            )
    conf = (cmp.get("narrative") or {}).get("confidence") or {}
    if conf.get("abs_diff") is not None and conf["abs_diff"] >= 0.15:
        notes.append(f"Confidence shifted by {conf['abs_diff']:.2f}")
    reason_cell = (cmp.get("narrative") or {}).get("reasoning") or {}
    if not reason_cell.get("match"):
        notes.append("Reasoning text drifted (expected for narrative fields)")
    mh = (cmp.get("narrative") or {}).get("must_haves_met") or {}
    if mh.get("prod_only") or mh.get("rerun_only"):
        notes.append(
            f"must_haves set drift (prod_only={mh.get('prod_only')}, "
            f"rerun_only={mh.get('rerun_only')})"
        )
    if cmp.get("stable_all_match"):
        notes.append("Structural fields matched")
    return notes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod", action="store_true", help="Read from production DB")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--delay", type=float, default=3.0)
    args = parser.parse_args()

    reset_supabase_client_cache()
    logger.info("tavily available=%s", is_tavily_available())
    try:
        require_tavily()
    except Exception as exc:
        logger.error("require_tavily failed: %s", exc)
        write_report(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "headline": f"ABORT: Tavily unavailable ({exc})",
                "jobs": [],
                "failures": [f"TavilyUnavailable: {exc}"],
            }
        )
        raise SystemExit(2) from exc

    try:
        clf = SSEClassifier()
    except SSEClassificationError as exc:
        logger.error("SSEClassifier init failed: %s", exc)
        raise SystemExit(2) from exc

    jobs = fetch_completed_jobs_last_week(limit=args.limit)
    logger.info("Selected %d jobs for parity", len(jobs))
    for j in jobs:
        logger.info(
            "  pick id=%s rating=%s org=%s title=%s",
            j.get("id"),
            j.get("sse_rating"),
            j.get("organization"),
            (j.get("job_title") or "")[:60],
        )

    reports: list[dict] = []
    failures: list[str] = []
    stable_matches = 0

    for i, job in enumerate(jobs):
        if i:
            time.sleep(args.delay)
        prod = _prod_snapshot(job)
        logger.info(
            "=== JOB %d/%d %s @ %s (prod=%s) ===",
            i + 1,
            len(jobs),
            prod.get("job_title"),
            prod.get("organization"),
            prod.get("sse_rating"),
        )
        try:
            rerun = classify_job_tavily_always(clf, job)
        except Exception as exc:
            logger.error("Unhandled: %s\n%s", exc, traceback.format_exc())
            rerun = {"error": str(exc), "elapsed_s": None, "tavily_always": True}
            failures.append(f"job {prod.get('id')}: {exc}")

        if rerun.get("error"):
            err = str(rerun["error"])
            failures.append(f"job {prod.get('id')}: {err}")
            if "429" in err or "quota" in err.lower() or "rate" in err.lower():
                failures.append(f"likely rate-limit/429 on job {prod.get('id')}")

        cmp = _compare(prod, rerun) if not rerun.get("error") else {}
        if cmp.get("stable_all_match"):
            stable_matches += 1
        notes = _diff_notes(prod, rerun, cmp)
        logger.info(
            "  rerun rating=%s is_sse=%s provider=%s elapsed=%ss notes=%s",
            rerun.get("sse_rating"),
            rerun.get("is_sse"),
            rerun.get("provider"),
            rerun.get("elapsed_s"),
            notes,
        )
        reports.append(
            {
                "job_id": prod.get("id"),
                "title": prod.get("job_title"),
                "organization": prod.get("organization"),
                "prod": prod,
                "rerun": rerun,
                "compare": cmp,
                "diff_notes": notes,
            }
        )

    n = len(reports)
    ok = stable_matches
    drifted = n - ok - sum(1 for r in reports if (r.get("rerun") or {}).get("error"))
    erred = sum(1 for r in reports if (r.get("rerun") or {}).get("error"))
    headline = (
        f"**{ok}/{n}** jobs kept stable `sse_rating`/`is_sse` under tavily-always; "
        f"{drifted} structural drift(s); {erred} error(s)."
    )
    if failures:
        headline += f" Failures: {len(failures)}."

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "tavily_always_force_grounding",
        "provider_chain": "gemini → groq → cerebras (SSEFallbackProvider)",
        "dry_run": True,
        "wrote_to_db": False,
        "headline": headline,
        "stable_match_count": ok,
        "job_count": n,
        "failures": failures,
        "jobs": reports,
    }
    write_report(payload)
    print("\n======== HEADLINE ========")
    print(headline)
    print(f"Report: {REPORT_MD}")
    print(f"JSON:   {REPORT_JSON}")
    print(f"Log:    {LOG_PATH}")


if __name__ == "__main__":
    main()
