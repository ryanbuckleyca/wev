"""Find and process unprocessed orgs and jobs.

Reusable helpers used by scrape.py and by ad-hoc scripts like process_unprocessed.py.
- An "unprocessed job" lacks any of: summary, values, is_sse, valid language, skills
- An "unprocessed organization" lacks any of: sector_id, type, description_en/description_fr,
  valid language, or values_list
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Tuple

from utils.db import fetch_all_rows, supabase
from utils.log import scraper_log as _log

VALID_LANGUAGES = frozenset({"en", "fr", "bilingual"})
PAGE_SIZE = 1000

_ORG_BOOL_FIELDS = frozenset({"is_sse"})
_ORG_LIST_FIELDS = frozenset({"values_list", "values_rated", "must_haves_met", "nice_to_haves_met", "skills"})
_ORG_LANGUAGE_FIELDS = frozenset({"language"})


def _is_org_field_missing(org: Dict[str, Any], field: str) -> bool:
    """Field-aware "is missing" predicate for org rows that matches the
    incomplete-record scan semantics, while preserving explicit booleans.
    """
    if field in _ORG_BOOL_FIELDS:
        return org.get(field) is None
    if field in _ORG_LANGUAGE_FIELDS:
        return org.get(field) not in VALID_LANGUAGES
    if field in _ORG_LIST_FIELDS:
        return not org.get(field)
    value = org.get(field)
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    return False


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------


def find_unprocessed_jobs() -> List[Tuple[Dict[str, Any], List[str]]]:
    """Return (job, needs[]) tuples for every job that is missing post-processing fields."""
    jobs: List[dict] = fetch_all_rows(
        "jobs",
        "id, listing_url, summary, values, is_sse, language, skills, organization_id, "
        "job_title, organization, scraped_at",
        order_by="scraped_at",
        desc=False,
    )
    unprocessed: List[Tuple[Dict[str, Any], List[str]]] = []
    for j in jobs:
        needs: List[str] = []
        if not (j.get("summary") or "").strip():
            needs.append("summary")
        if not j.get("values"):
            needs.append("values")
        if j.get("is_sse") is None:
            needs.append("sse")
        if j.get("language") not in VALID_LANGUAGES:
            needs.append("language")
        if not j.get("skills"):
            needs.append("skills")
        if j.get("organization_id") is None:
            needs.append("organization_id")
        if needs:
            unprocessed.append((j, needs))
    return unprocessed


def find_unprocessed_organizations() -> List[Tuple[Dict[str, Any], List[str]]]:
    """Return (org, needs[]) tuples for every organization missing core assessed fields."""
    # Try full select first; fall back to the column set we know always exists.
    try:
        orgs: List[dict] = fetch_all_rows("organizations", "*", order_by="id", desc=False)
    except Exception as e:
        # Only swallow missing-column/schema errors; let auth/network errors bubble up.
        msg = str(e).lower()
        expected_failure = any(
            marker in msg for marker in ("column", "does not exist", "42703", "undefined")
        )
        if not expected_failure:
            raise
        orgs = fetch_all_rows(
            "organizations",
            "id,name,sector_id,type,description,description_en,description_fr,website,location,is_sse,sse_rating,"
            "mission_statement,values_list,values_rated,language,municipality,province,"
            "lat,lng,geocode_accuracy_type,created_at,slug",
            order_by="id",
            desc=False,
        )

    unprocessed: List[Tuple[Dict[str, Any], List[str]]] = []
    for o in orgs:
        needs: List[str] = []
        if not o.get("sector_id"):
            needs.append("sector_id")
        if not o.get("type"):
            needs.append("type")
        desc_en = o.get("description_en") or o.get("description")
        desc_fr = o.get("description_fr")
        if not (desc_en or "").strip():
            needs.append("description_en")
        if not (desc_fr or "").strip():
            needs.append("description_fr")
        if o.get("language") not in VALID_LANGUAGES:
            needs.append("language")
        if not o.get("values_list"):
            needs.append("values_list")
        if needs:
            unprocessed.append((o, needs))
    return unprocessed


# ---------------------------------------------------------------------------
# Processing helpers
# ---------------------------------------------------------------------------


def process_unprocessed_jobs(
    unprocessed: List[Tuple[Dict[str, Any], List[str]]],
) -> Tuple[int, int]:
    """Run unified post-processor + ESCO skills tagger on a list of (job, needs[]).

    Returns (processed_count, error_count).
    """
    if not unprocessed:
        return 0, 0

    job_ids = [j["id"] for j, _ in unprocessed]
    _log(f"Processing {len(job_ids)} previously-unprocessed jobs...")

    total_errors = 0
    total_processed = 0

    # 1) Unified post-processor (summary / values / SSE / language)
    unified_job_ids = [
        j["id"] for j, needs in unprocessed
        if any(req in needs for req in ("summary", "values", "sse", "language"))
    ]
    if unified_job_ids:
        try:
            from scripts.unified_post_processor import ProcessingOptions, process_jobs_unified

            result = process_jobs_unified(
                ProcessingOptions(task="all", page_limit=None, job_ids=unified_job_ids, dry_run=False, verbose=False)
            )
            total_processed += result.get("processed", 0)
            total_errors += result.get("errors", 0)
        except Exception as e:
            _log(f"❌ Unified post-processor failed: {e}")
            total_errors += len(unified_job_ids)

    # 2) ESCO skills vector tagging
    esco_ids = [j["id"] for j, needs in unprocessed if "skills" in needs]
    if esco_ids:
        try:
            from scripts.tag_esco_skills_vector import tag_esco_skills_vector

            result = tag_esco_skills_vector(job_ids=esco_ids)
            total_processed += result.get("processed", 0)
            total_errors += result.get("errors", 0)
        except Exception as e:
            _log(f"❌ ESCO tagging failed: {e}")
            total_errors += len(esco_ids)

    return total_processed, total_errors


def process_unprocessed_organizations(
    unprocessed: List[Tuple[Dict[str, Any], List[str]]],
) -> Tuple[int, int]:
    """Re-assess every (org, needs[]) with OrganizationAssessor and write missing fields.

    Returns (success_count, error_count).
    """
    if not unprocessed:
        return 0, 0

    _log(f"Assessing {len(unprocessed)} previously-incomplete organizations...")

    from llm.tavily_grounding import is_tavily_available
    from utils.organization_assessment import OrganizationAssessor, _result_to_db_fields

    if not is_tavily_available():
        _log("⚠️  Tavily not available — organization assessment may produce degraded results")

    assessor = OrganizationAssessor()

    success = 0
    errors = 0
    for i, (org, _needs) in enumerate(unprocessed, 1):
        oid = org["id"]
        name = org.get("name") or "(unnamed)"

        if i % 25 == 0:
            _log(f"  Orgs: {i}/{len(unprocessed)} | success={success} | errors={errors}")

        try:
            existing_description = org.get("description_en") or org.get("description")
            result = assessor.assess(
                raw_name=name,
                municipality=org.get("municipality"),
                province=org.get("province"),
                job_title="",
                description="",
                known_website=org.get("website"),
                existing_description=existing_description,
            )

            if result:
                update_fields = _result_to_db_fields(result)
                filtered = {}
                for field, value in update_fields.items():
                    if value is not None and _is_org_field_missing(org, field):
                        filtered[field] = value
                if filtered:
                    supabase.table("organizations").update(filtered).eq("id", oid).execute()
                    success += 1
            else:
                errors += 1
        except Exception as e:
            _log(f"  Org [{name}] error: {e}")
            errors += 1

        # Gentle rate limit — Gemini free tier ~15 RPM; keep well under to avoid
        # 429/503 spikes that trigger long cooldowns. Override via
        # ORG_ASSESS_DELAY_SECONDS=0 for zero-delay runs against paid quota.
        try:
            delay_s = float(os.environ.get("ORG_ASSESS_DELAY_SECONDS", "2.5"))
        except ValueError:
            delay_s = 2.5
        if delay_s > 0:
            time.sleep(delay_s)

    return success, errors


# ---------------------------------------------------------------------------
# Main entry point used by scrape.py
# ---------------------------------------------------------------------------


def catch_up_unprocessed(*, skip_orgs: bool = False, skip_jobs: bool = False) -> Dict[str, int]:
    """Find any unprocessed orgs/jobs in the DB and process them (before scraping new items).

    Used automatically by the scraper at the top of each run. Returns a dict
    with counts for logging/reporting.

    Set skip_orgs/skip_jobs to True to disable that pass (useful when you only
    want to scrape new data).
    """
    report: Dict[str, int] = {
        "orgs_total": 0,
        "orgs_processed": 0,
        "orgs_errors": 0,
        "jobs_total": 0,
        "jobs_processed": 0,
        "jobs_errors": 0,
    }

    # Short-circuit if the feature is explicitly disabled
    if os.environ.get("SCRAPER_SHOULD_CATCH_UP", "1").strip().lower() in ("0", "false", "no", "off"):
        _log("SCRAPER_SHOULD_CATCH_UP=0 — skipping unprocessed catch-up pass.")
        return report

    # ── 1. Organizations first (so jobs can resolve organization_id properly) ──
    if not skip_orgs:
        t0 = time.time()
        unprocessed_orgs = find_unprocessed_organizations()
        report["orgs_total"] = len(unprocessed_orgs)
        if unprocessed_orgs:
            _log(f"Found {len(unprocessed_orgs)} incomplete orgs — processing before scraping new data")
            ok, err = process_unprocessed_organizations(unprocessed_orgs)
            report["orgs_processed"] = ok
            report["orgs_errors"] = err
            _log(
                f"Org catch-up complete: {ok}/{len(unprocessed_orgs)} ok, {err} errors "
                f"({time.time() - t0:.1f}s)"
            )
        else:
            _log("✅ All organizations already processed.")

    # ── 2. Jobs ─────────────────────────────────────────────────────────────────
    if not skip_jobs:
        t0 = time.time()
        unprocessed_jobs = find_unprocessed_jobs()
        report["jobs_total"] = len(unprocessed_jobs)
        if unprocessed_jobs:
            _log(f"Found {len(unprocessed_jobs)} unprocessed jobs — processing before scraping new data")
            ok, err = process_unprocessed_jobs(unprocessed_jobs)
            report["jobs_processed"] = ok
            report["jobs_errors"] = err
            _log(
                f"Job catch-up complete: {ok}/{len(unprocessed_jobs)} processed, {err} errors "
                f"({time.time() - t0:.1f}s)"
            )
        else:
            _log("✅ All jobs already processed.")

    return report
