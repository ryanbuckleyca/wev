"""Find and process unprocessed orgs and jobs.

Reusable helpers used by scrape.py and by ad-hoc scripts like process_unprocessed.py.
- An "unprocessed job" lacks any of: summary, values, is_sse, valid language, skills
- An "unprocessed organization" lacks any of: sector_id, type, description_en/description_fr,
  valid language, or values_list

Organizations are assessed at most once per catch-up. Any attempt that does not
complete the org writes organizations.assessment_skip_reason, which parks the row
so later runs skip it instead of re-spending LLM credits. Admins clear the reason
from the admin organizations page to grant another attempt.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from utils.db import fetch_all_rows, supabase
from utils.log import scraper_log as _log

VALID_LANGUAGES = frozenset({"en", "fr", "bilingual"})
PAGE_SIZE = 1000

# Assessment ran but left the org short of complete. Written here rather than by
# the assessor, which cannot see what the DB already had.
SKIP_REASON_NO_NEW_FIELDS = "no_new_fields"
SKIP_REASON_PARTIAL_FILL = "partial_fill"
SKIP_REASON_EXCEPTION = "exception"
# Written by the 20260901120000 migration for the pre-existing backlog.
SKIP_REASON_INCOMPLETE_BACKLOG = "incomplete_backlog"
# Admin chose to stop surfacing this org in the review queue.
SKIP_REASON_IGNORED = "ignored"

DEFAULT_CATCH_UP_ORG_LIMIT = 20

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


def find_missing_org_fields(org: Dict[str, Any]) -> List[str]:
    """Return the required assessed fields this organization is still missing.

    An organization with no missing fields is complete and must never be queued
    for assessment.
    """
    needs: List[str] = []
    if not org.get("sector_id"):
        needs.append("sector_id")
    if not org.get("type"):
        needs.append("type")
    desc_en = org.get("description_en") or org.get("description")
    if not (desc_en or "").strip():
        needs.append("description_en")
    if not (org.get("description_fr") or "").strip():
        needs.append("description_fr")
    if org.get("language") not in VALID_LANGUAGES:
        needs.append("language")
    if not org.get("values_list"):
        needs.append("values_list")
    return needs


def find_unprocessed_organizations(
    *, include_parked: bool = False
) -> List[Tuple[Dict[str, Any], List[str]]]:
    """Return (org, needs[]) tuples for organizations eligible for assessment.

    Eligible means incomplete AND not parked. A row is parked once
    assessment_skip_reason is set, which happens after any attempt that failed to
    complete it; only an admin (or include_parked) brings it back.
    """
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
            "lat,lng,geocode_accuracy_type,created_at,updated_at,slug,assessment_skip_reason",
            order_by="id",
            desc=False,
        )

    unprocessed: List[Tuple[Dict[str, Any], List[str]]] = []
    for o in orgs:
        # fetch_all_rows only supports equality filters, so parked rows are
        # filtered here rather than pushed down to PostgREST.
        if not include_parked and o.get("assessment_skip_reason") is not None:
            continue
        needs = find_missing_org_fields(o)
        if needs:
            unprocessed.append((o, needs))
    return unprocessed


def resolve_org_skip_reason(
    org: Dict[str, Any],
    outcome: Any,
    filtered: Dict[str, Any],
) -> str | None:
    """Decide what to write to assessment_skip_reason after one attempt.

    Returns None when the org came out complete (clearing any prior reason), or
    the reason that parks it for human review. Order-independent: it merges
    *filtered* over *org* itself rather than trusting the caller to have done so.
    """
    if outcome.result is None:
        return outcome.skip_reason or SKIP_REASON_EXCEPTION
    if not filtered:
        return SKIP_REASON_NO_NEW_FIELDS
    if find_missing_org_fields({**org, **filtered}):
        return SKIP_REASON_PARTIAL_FILL
    return None


@dataclass(frozen=True)
class OrgAssessmentWriteResult:
    """Result of filtering and persisting one assessment outcome."""

    filtered: Dict[str, Any]
    reason: str | None
    applied: bool


def filter_assessment_update_fields(
    org: Dict[str, Any],
    outcome: Any,
) -> Dict[str, Any]:
    """Return assessor DB fields to write — only those still missing on *org*."""
    from utils.organization_assessment import _result_to_db_fields

    filtered: Dict[str, Any] = {}
    if not outcome.result:
        return filtered
    for field, value in _result_to_db_fields(outcome.result).items():
        if value is not None and _is_org_field_missing(org, field):
            filtered[field] = value
    return filtered


def persist_org_assessment_outcome(
    org: Dict[str, Any],
    outcome: Any,
) -> OrgAssessmentWriteResult:
    """Filter fields, resolve skip reason, and CAS-write on updated_at.

    Returns applied=False when another writer changed the row since we read it.
    """
    filtered = filter_assessment_update_fields(org, outcome)
    reason = resolve_org_skip_reason(org, outcome, filtered)
    payload = {**filtered, "assessment_skip_reason": reason}

    oid = org["id"]
    read_at = org.get("updated_at")
    query = supabase.table("organizations").update(payload).eq("id", oid)
    if read_at:
        query = query.eq("updated_at", read_at)
    resp = query.execute()

    if not resp.data:
        return OrgAssessmentWriteResult(filtered, reason, False)

    org.update(filtered)
    return OrgAssessmentWriteResult(filtered, reason, True)


def _park_org(org: Dict[str, Any], reason: str | None) -> None:
    """Write assessment_skip_reason on its own, tolerating DB failure.

    Only for exception handlers: a failed park must not abort the remaining orgs.

    Conditioned on the reason we read, so parking cannot overwrite an administrative
    decision taken while the assessment was running — an admin Retry that cleared the
    reason, or an Ignore. Guarding on assessment_skip_reason rather than on the row
    version like persist_org_assessment_outcome does is deliberate: organizations has
    no updated_at column, so a row-level compare-and-swap has nothing to compare.
    """
    oid = org["id"]
    read_reason = org.get("assessment_skip_reason")
    try:
        query = supabase.table("organizations").update(
            {"assessment_skip_reason": reason}
        ).eq("id", oid)
        # PostgREST needs is.null rather than eq for an unset reason.
        if read_reason is None:
            query = query.is_("assessment_skip_reason", "null")
        else:
            query = query.eq("assessment_skip_reason", read_reason)
        resp = query.execute()
        if not resp.data:
            _log(
                f"  ⚠️  Did not park org {oid} as {reason!r}: "
                f"assessment_skip_reason changed since read (was {read_reason!r})"
            )
    except Exception as e:
        _log(f"  ⚠️  Could not park org {oid} as {reason!r}: {e}")


def org_batch_limit() -> int:
    """Max orgs to assess per catch-up run. 0 or negative means no cap."""
    raw = os.environ.get("CATCH_UP_ORG_LIMIT", str(DEFAULT_CATCH_UP_ORG_LIMIT))
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_CATCH_UP_ORG_LIMIT


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
) -> Tuple[int, int, int]:
    """Assess every (org, needs[]) once and write both fields and skip reason.

    Every attempt writes assessment_skip_reason — NULL when the org came out
    complete, otherwise the reason it parked. Writing on failure is the point:
    previously a failed assessment wrote nothing, so the same orgs were retried
    on every scrape forever.

    Returns (success_count, error_count, parked_count).
    """
    if not unprocessed:
        return 0, 0, 0

    _log(f"Assessing {len(unprocessed)} previously-incomplete organizations...")

    from llm.tavily_grounding import is_tavily_available
    from utils.organization_assessment import OrganizationAssessor

    if not is_tavily_available():
        _log("⚠️  Tavily not available — organization assessment may produce degraded results")

    assessor = OrganizationAssessor()

    success = 0
    errors = 0
    parked = 0
    for i, (org, _needs) in enumerate(unprocessed, 1):
        name = org.get("name") or "(unnamed)"

        if i % 25 == 0:
            _log(
                f"  Orgs: {i}/{len(unprocessed)} | success={success} | "
                f"parked={parked} | errors={errors}"
            )

        try:
            existing_description = org.get("description_en") or org.get("description")
            outcome = assessor.assess_with_outcome(
                raw_name=name,
                municipality=org.get("municipality"),
                province=org.get("province"),
                job_title="",
                description="",
                known_website=org.get("website"),
                existing_description=existing_description,
            )

            write = persist_org_assessment_outcome(org, outcome)
            reason = write.reason

            if not write.applied:
                _log(f"  ⚠️  Org [{name}] skipped: row changed since read")
                errors += 1
                continue

            if reason is None:
                success += 1
            else:
                parked += 1
                if outcome.result is None:
                    errors += 1
                _log(f"  ⏸  Org [{name}] parked: {reason}")
        except Exception as e:
            _log(f"  Org [{name}] error: {e}")
            errors += 1
            parked += 1
            _park_org(org, SKIP_REASON_EXCEPTION)

        # Gentle rate limit — Gemini free tier ~15 RPM; keep well under to avoid
        # 429/503 spikes that trigger long cooldowns. Override via
        # ORG_ASSESS_DELAY_SECONDS=0 for zero-delay runs against paid quota.
        try:
            delay_s = float(os.environ.get("ORG_ASSESS_DELAY_SECONDS", "2.5"))
        except ValueError:
            delay_s = 2.5
        if delay_s > 0:
            time.sleep(delay_s)

    return success, errors, parked


# ---------------------------------------------------------------------------
# Main entry point used by scrape.py
# ---------------------------------------------------------------------------


def catch_up_unprocessed(*, skip_orgs: bool = False, skip_jobs: bool = False) -> Dict[str, int]:
    """Find any unprocessed orgs/jobs in the DB and process them after scraping.

    Used automatically by the scraper at the end of each run. Returns a dict
    with counts for logging/reporting.

    Set skip_orgs/skip_jobs to True to disable that pass (useful when you only
    want to scrape new data).
    """
    report: Dict[str, int] = {
        "orgs_total": 0,
        "orgs_processed": 0,
        "orgs_parked": 0,
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
        eligible_orgs = find_unprocessed_organizations()
        limit = org_batch_limit()
        if limit > 0 and len(eligible_orgs) > limit:
            # Ordered by id, so the backlog drains deterministically across runs
            # instead of blocking the scrape behind hundreds of LLM calls.
            _log(
                f"Found {len(eligible_orgs)} eligible incomplete orgs — "
                f"processing first {limit} (CATCH_UP_ORG_LIMIT={limit})"
            )
            unprocessed_orgs = eligible_orgs[:limit]
        else:
            unprocessed_orgs = eligible_orgs
            if unprocessed_orgs:
                _log(
                    f"Found {len(unprocessed_orgs)} eligible incomplete orgs — "
                    "processing after scraping new data"
                )
        report["orgs_total"] = len(unprocessed_orgs)
        if unprocessed_orgs:
            ok, err, parked = process_unprocessed_organizations(unprocessed_orgs)
            report["orgs_processed"] = ok
            report["orgs_errors"] = err
            report["orgs_parked"] = parked
            _log(
                f"Org catch-up complete: {ok}/{len(unprocessed_orgs)} ok, "
                f"{parked} parked for review, {err} errors "
                f"({time.time() - t0:.1f}s)"
            )
        else:
            _log("✅ No organizations eligible for assessment.")

    # ── 2. Jobs ─────────────────────────────────────────────────────────────────
    if not skip_jobs:
        t0 = time.time()
        unprocessed_jobs = find_unprocessed_jobs()
        report["jobs_total"] = len(unprocessed_jobs)
        if unprocessed_jobs:
            _log(f"Found {len(unprocessed_jobs)} unprocessed jobs — processing after scraping new data")
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
