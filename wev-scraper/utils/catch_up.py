"""Find and process unprocessed orgs and jobs.

Reusable helpers used by scrape.py and by ad-hoc scripts like process_unprocessed.py.
- An "unprocessed job" lacks any of: summary, values, is_sse, valid language, skills,
  or organization_id. Skills uses the skills_raw / jobs.skills contract — see
  job_needs_skills. organization_id is resolved here, not left for a separate backfill.
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
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, NamedTuple, Tuple

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


def job_needs_skills(job: Dict[str, Any]) -> bool:
    """True when this job still needs skills extract and/or ESCO tagging.

    Contract:
    - no description → False (nothing to extract; matches _needs_skills_reextract guard)
    - ``skills_raw is None`` → never extracted (needs unified extract, then tag)
    - ``skills_raw == []`` (or only blank strings) → extract finished empty; done
    - phrases present + ``skills is None`` → phrases awaiting ESCO tag
    - phrases present + ``skills == []`` → tagged, zero ESCO hits; done (durable)
    - phrases present + non-empty ``skills`` → tagged; done
    """
    if not (job.get("description") or "").strip():
        return False
    skills_raw = job.get("skills_raw")
    if skills_raw is None:
        return True
    if not isinstance(skills_raw, list):
        return True
    if not any(str(s).strip() for s in skills_raw):
        return False
    return job.get("skills") is None


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------


def find_unprocessed_jobs() -> List[Tuple[Dict[str, Any], List[str]]]:
    """Return (job, needs[]) tuples for every job that is missing post-processing fields."""
    jobs: List[dict] = fetch_all_rows(
        "jobs",
        "id, listing_url, summary, values, is_sse, language, skills, skills_raw, "
        "description, organization_id, job_title, organization, municipality, province, "
        "location, scraped_at",
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
        if job_needs_skills(j):
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

    Completeness is checked before "did we contribute anything", so an org that is
    already complete clears its reason even when the assessment had nothing new to
    add. Ordering it the other way parked rows an admin had just finished filling in.
    """
    if outcome.result is None:
        return outcome.skip_reason or SKIP_REASON_EXCEPTION
    if not find_missing_org_fields({**org, **filtered}):
        return None
    return SKIP_REASON_PARTIAL_FILL if filtered else SKIP_REASON_NO_NEW_FIELDS


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
    from utils.organization_assessment import _attach_org_language, _result_to_db_fields

    filtered: Dict[str, Any] = {}
    if not outcome.result:
        return filtered
    db_fields = _result_to_db_fields(outcome.result)

    # Catch-up used to skip name-based language classification; LLM public_language
    # alone left French-named orgs (e.g. Habitations Les Trinitaires) with null language.
    # Do not seed draft["language"] from public_language — that short-circuits
    # classify_org_language. Pass public_language as the soft tiebreaker instead so a
    # French name can beat a soft English public_language guess.
    if _is_org_field_missing(org, "language"):
        draft = {
            "name": org.get("name") or outcome.result.get("canonical_name"),
            "website": db_fields.get("website") or org.get("website"),
            "language": None,
            "sse_details": dict(db_fields.get("sse_details") or {}),
        }
        _attach_org_language(
            draft,
            outcome.result.get("public_language"),
            fetch_web=False,
        )
        if draft.get("language"):
            db_fields["language"] = draft["language"]
        # Only fold language provenance into sse_details when the assessor already
        # produced one — avoid inventing an empty sse_details write.
        if "sse_details" in db_fields and isinstance(draft.get("sse_details"), dict):
            db_fields["sse_details"] = draft["sse_details"]

    for field, value in db_fields.items():
        if value is not None and _is_org_field_missing(org, field):
            filtered[field] = value

    # is_sse defaults to false in the DB, so the missing-predicate treats it as
    # already set. Keep the boolean locked to whatever rating this write leaves
    # on the row — never flip is_sse from a new assessment while preserving an
    # older conflicting sse_rating.
    if "sse_rating" in filtered:
        rating = filtered["sse_rating"]
        expected = db_fields.get("is_sse")
        filtered["is_sse"] = (
            bool(expected) if expected is not None else rating in ("strong_yes", "weak_yes")
        )
    elif "sse_details" in filtered:
        preserved = org.get("sse_rating")
        if preserved is not None:
            filtered["is_sse"] = preserved in ("strong_yes", "weak_yes")

    return filtered


def _reload_org(oid: Any) -> Dict[str, Any] | None:
    """Re-read one organization row. None means gone, or unreadable right now."""
    try:
        resp = (
            supabase.table("organizations").select("*").eq("id", oid).limit(1).execute()
        )
    except Exception as e:
        _log(f"  ⚠️  Could not re-read org {oid} before writing: {e}")
        return None
    rows = resp.data or []
    return rows[0] if rows else None


def _require_unchanged_reason(query: Any, read_reason: str | None) -> Any:
    """Constrain an organizations update to rows whose skip reason still matches.

    Stands in for a row-version compare-and-swap, which organizations cannot support
    because it has no updated_at column. Stops a write from overwriting an admin
    decision — a Retry that cleared the reason, or an Ignore.
    """
    # PostgREST needs is.null rather than eq for an unset reason.
    if read_reason is None:
        return query.is_("assessment_skip_reason", "null")
    return query.eq("assessment_skip_reason", read_reason)


def persist_org_assessment_outcome(
    org: Dict[str, Any],
    outcome: Any,
) -> OrgAssessmentWriteResult:
    """Filter fields, resolve the skip reason, and write, guarded against races.

    Assessment takes seconds to minutes of LLM and search calls, so the row is
    re-read immediately before writing and the outcome is resolved against that
    fresh copy. Deciding from the snapshot we started with would park an org an
    admin had completed in the meantime, bouncing it back into the review queue.

    Returns applied=False when the row vanished or another writer changed its skip
    reason since the re-read.
    """
    oid = org["id"]
    current = _reload_org(oid)
    if current is None:
        return OrgAssessmentWriteResult({}, None, False)

    filtered = filter_assessment_update_fields(current, outcome)
    reason = resolve_org_skip_reason(current, outcome, filtered)
    payload = {**filtered, "assessment_skip_reason": reason}

    query = supabase.table("organizations").update(payload).eq("id", oid)
    query = _require_unchanged_reason(query, current.get("assessment_skip_reason"))
    resp = query.execute()

    if not resp.data:
        return OrgAssessmentWriteResult(filtered, reason, False)

    # Reflect both the admin's concurrent edits and our own write, so callers log
    # what is actually missing now rather than what was missing at selection time.
    org.update(current)
    org.update(filtered)
    org["assessment_skip_reason"] = reason

    # SSE is an employer property: when the org is non-SSE, demote any jobs that
    # still claim is_sse=true (write-time job gate only covers new classifications).
    if org.get("is_sse") is False:
        from utils.job_sse import demote_org_job_sse

        demoted = demote_org_job_sse(supabase, oid)
        if demoted:
            _log(f"  ↳ Demoted is_sse on {demoted} job(s) for non-SSE org {oid}")

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
        resp = _require_unchanged_reason(query, read_reason).execute()
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

_LLM_ID_CHUNK = 100
_NON_SKILLS_NEEDS = frozenset({"summary", "values", "sse", "language"})


class OrgPassResult(NamedTuple):
    """Outcome of one organization catch-up pass."""

    success: int
    errors: int
    parked: int
    parked_reasons: tuple[str, ...] = ()
    hard_errors: int = 0
    fallbacks: tuple[dict, ...] = ()
    provider_used: str | None = None


@dataclass
class JobCatchUpResult:
    """What the job catch-up actually did, split by kind of work."""

    llm_targeted: int = 0
    llm_written: int = 0
    llm_deferred: int = 0
    llm_errors: int = 0
    esco_targeted: int = 0
    esco_written: int = 0
    esco_errors: int = 0
    org_targeted: int = 0
    org_linked: int = 0
    org_unresolved: int = 0
    org_no_name: int = 0
    org_errors: int = 0
    fallbacks: list = field(default_factory=list)
    provider_used: str | None = None
    quota_exhausted: bool = False
    unresolved_labels: list = field(default_factory=list)
    unresolved_org_names: list = field(default_factory=list)


def _merge_fallback_notes(dest: list, items) -> None:
    for item in items or []:
        if isinstance(item, dict) and item not in dest:
            dest.append(item)


def _job_label(job: Dict[str, Any]) -> str:
    title = (job.get("job_title") or "").strip() or "(no title)"
    org = (job.get("organization") or "").strip() or "(no organization name)"
    return f"{str(job.get('id', ''))[:8]}… {title[:48]} ({org[:48]})"


def _reason_counts(reasons: List[str] | tuple[str, ...]) -> str:
    counts = Counter(reasons)
    return ", ".join(
        f"{n}× {reason}" if n > 1 else reason
        for reason, n in counts.most_common()
    )


def org_catch_up_lines(
    total: int,
    ok: int,
    parked: int,
    reasons: List[str] | tuple[str, ...],
    hard_errors: int,
    fallbacks: list | tuple,
    provider_used: str | None,
) -> List[str]:
    """Lines for the organization section of the catch-up summary."""
    reason_bit = f" ({_reason_counts(reasons)})" if reasons else ""
    line = f"Organizations: {ok}/{total} completed, {parked} parked{reason_bit}"
    if hard_errors:
        line += f", {hard_errors} errors"
    lines = [line]
    if fallbacks:
        from llm.cooldown import format_fallback_chain

        succeeded = provider_used if provider_used and "," not in provider_used else None
        lines.append("  fallback: " + format_fallback_chain(list(fallbacks), succeeded))
    return lines


def job_catch_up_lines(
    found: int,
    result: JobCatchUpResult,
    remaining: List[Tuple[Dict[str, Any], List[str]]],
    name_reviews: List[str] | None = None,
) -> List[str]:
    """Explain which jobs were written, which fell through a model, and what is left."""
    from llm.cooldown import format_fallback_chain

    lines = [f"Jobs: {found} unprocessed"]
    if result.llm_targeted:
        via = f" via {result.provider_used}" if result.provider_used else ""
        lines.append(f"  LLM fields: {result.llm_written}/{result.llm_targeted} written{via}")
        if result.fallbacks:
            succeeded = result.provider_used if result.provider_used and "," not in result.provider_used else None
            lines.append("    fallback: " + format_fallback_chain(result.fallbacks, succeeded))
        if result.llm_deferred:
            lines.append(
                f"    {result.llm_deferred} not written — every configured model hit a free-tier daily quota"
            )
        if result.llm_errors:
            lines.append(f"    {result.llm_errors} errors")
    else:
        lines.append("  LLM fields: none needed")

    if result.esco_targeted:
        lines.append(f"  Skills/ESCO: {result.esco_written}/{result.esco_targeted} tagged")
        if result.esco_errors:
            lines.append(f"    {result.esco_errors} errors")
    else:
        lines.append("  Skills/ESCO: none needed")

    if result.org_targeted:
        bits = [f"{result.org_linked}/{result.org_targeted} linked"]
        if result.org_unresolved:
            bits.append(f"{result.org_unresolved} unresolved")
        if result.org_no_name:
            bits.append(f"{result.org_no_name} with no organization name")
        if result.org_errors:
            bits.append(f"{result.org_errors} errors")
        lines.append("  organization_id: " + ", ".join(bits))
        shown = result.unresolved_labels[:8]
        for label in shown:
            lines.append(f"    unresolved: {label}")
        extra = len(result.unresolved_labels) - len(shown)
        if extra > 0:
            lines.append(f"    … and {extra} more unresolved")
    else:
        lines.append("  organization_id: none missing")

    by_need: Dict[str, int] = {}
    for _job, needs in remaining:
        for need in needs:
            by_need[need] = by_need.get(need, 0) + 1
    still = len(remaining)
    if still == 0:
        lines.append("  Still unprocessed: 0 — nothing further to run")
    else:
        lines.append(f"  Still unprocessed: {still}")
        for need in sorted(by_need):
            lines.append(f"    {by_need[need]} missing {need}")
        if result.quota_exhausted:
            lines.append(
                "  Re-run catch-up after updating the API key or when the quota resets. "
                "Jobs already written are skipped."
            )
        elif result.org_unresolved or result.org_no_name:
            notes: List[str] = []
            if result.org_unresolved:
                notes.append(
                    "Some jobs are still unlinked because that employer name matches more than one organization. "
                    "Exact duplicates are merged earlier in this run. Pairs that still need a yes are listed under Manual review."
                )
            if name_reviews:
                notes.append(
                    "These names differ only by punctuation or & / and:"
                )
            if result.org_no_name:
                notes.append(
                    "A job with no organization name cannot be linked until that name is filled in."
                )
            if by_need.get("sse"):
                notes.append(
                    "SSE is left unset until an employer is linked, and those jobs are not sent back to the model in the meantime."
                )
            lines.append("  " + " ".join(notes))
            for review in name_reviews or []:
                lines.append(review)
        else:
            lines.append("  These stay queued and are retried on the next catch-up.")
    return lines


def link_job_organizations(
    unprocessed: List[Tuple[Dict[str, Any], List[str]]],
) -> Dict[str, Any]:
    """Resolve and write organization_id for jobs that are still unlinked.

    Uses the same resolver as job insert. A null result leaves the job queued.
    """
    targets = [job for job, needs in unprocessed if "organization_id" in needs]
    stats: Dict[str, Any] = {
        "targeted": len(targets),
        "linked": 0,
        "unresolved": 0,
        "no_name": 0,
        "errors": 0,
        "unresolved_labels": [],
        "unresolved_org_names": [],
    }
    if not targets:
        return stats

    named: List[Dict[str, Any]] = []
    for job in targets:
        if (job.get("organization") or "").strip():
            named.append(job)
            continue
        label = _job_label(job)
        stats["no_name"] += 1
        stats["unresolved_labels"].append(f"{label} — no organization name")
        _log(f"  organization_id: {label} — no organization name")
    if not named:
        return stats

    from utils.organization_resolver import create_resolver

    try:
        resolver = create_resolver()
    except Exception as exc:
        _log(f"❌ Organization resolver unavailable: {exc}")
        stats["errors"] = len(named)
        stats["unresolved_labels"].extend(
            f"{_job_label(job)} — resolver unavailable" for job in named
        )
        return stats

    _log(f"Linking organization_id on {len(named)} jobs...")
    for job in named:
        label = _job_label(job)
        name = (job.get("organization") or "").strip()
        try:
            org_id = resolver.resolve(
                raw_name=name,
                municipality=job.get("municipality"),
                province=job.get("province"),
                location=job.get("location"),
                job_title=job.get("job_title") or "",
                description=job.get("description") or "",
                job_id=job.get("id"),
            )
        except Exception as exc:
            stats["errors"] += 1
            stats["unresolved_labels"].append(f"{label} — {exc}")
            _log(f"  organization_id: {label} — error: {exc}")
            continue
        if org_id is None:
            stats["unresolved"] += 1
            stats["unresolved_labels"].append(label)
            stats["unresolved_org_names"].append(name)
            _log(f"  organization_id: {label} — no match")
            continue
        try:
            supabase.table("jobs").update({"organization_id": org_id}).eq("id", job["id"]).execute()
        except Exception as exc:
            stats["errors"] += 1
            stats["unresolved_labels"].append(f"{label} — write failed: {exc}")
            _log(f"  organization_id: {label} — write failed: {exc}")
            continue
        stats["linked"] += 1
        job["organization_id"] = org_id
        _log(f"  organization_id: {label} → {org_id}")
    return stats


def process_unprocessed_jobs(
    unprocessed: List[Tuple[Dict[str, Any], List[str]]],
    skip_esco: bool = False,
) -> JobCatchUpResult:
    """Link organizations, then run the unified post-processor and ESCO tagger.

    Jobs that only lack organization_id are linked here. They are not sent to
    the LLM. Jobs that need summary, values, SSE, or language go through
    task="all". Jobs that only need skills_raw go through task="skills".
    """
    outcome = JobCatchUpResult()
    if not unprocessed:
        return outcome

    _log(f"Processing {len(unprocessed)} previously-unprocessed jobs...")

    org_stats = link_job_organizations(unprocessed)
    outcome.org_targeted = org_stats["targeted"]
    outcome.org_linked = org_stats["linked"]
    outcome.org_unresolved = org_stats["unresolved"]
    outcome.org_no_name = org_stats["no_name"]
    outcome.org_errors = org_stats["errors"]
    outcome.unresolved_labels = list(org_stats["unresolved_labels"])
    outcome.unresolved_org_names = list(org_stats["unresolved_org_names"])

    def _needs_llm(job: Dict[str, Any], needs: List[str]) -> bool:
        llm = [req for req in needs if req in _NON_SKILLS_NEEDS]
        # is_sse cannot be stored until an employer is linked. Sending the job
        # to the model again would spend a call and still leave is_sse null.
        if llm == ["sse"] and job.get("organization_id") is None:
            return False
        return bool(llm)

    all_task_ids = [
        j["id"] for j, needs in unprocessed
        if _needs_llm(j, needs)
    ]
    skills_only_ids = [
        j["id"] for j, needs in unprocessed
        if "skills" in needs and not any(req in needs for req in _NON_SKILLS_NEEDS)
    ]
    outcome.llm_targeted = len(all_task_ids) + len(skills_only_ids)

    from llm.cooldown import DailyQuotaExhaustedError
    from scripts.unified_post_processor import ProcessingOptions, process_jobs_unified

    providers: List[str] = []
    quota_hit = False

    def _consume(task: str, ids: List[str]) -> None:
        nonlocal quota_hit
        if not ids:
            return
        if quota_hit:
            outcome.llm_deferred += len(ids)
            return
        for offset in range(0, len(ids), _LLM_ID_CHUNK):
            if quota_hit:
                outcome.llm_deferred += len(ids) - offset
                return
            chunk = ids[offset:offset + _LLM_ID_CHUNK]
            try:
                raw = process_jobs_unified(
                    ProcessingOptions(
                        task=task,
                        page_limit=None,
                        job_ids=chunk,
                        dry_run=False,
                        verbose=False,
                    )
                )
            except DailyQuotaExhaustedError as exc:
                partial = getattr(exc, "partial", None) or {}
                outcome.llm_written += partial.get("processed", 0)
                outcome.llm_errors += partial.get("errors", 0)
                outcome.llm_deferred += partial.get("deferred", len(chunk))
                outcome.llm_deferred += len(ids) - (offset + len(chunk))
                _merge_fallback_notes(outcome.fallbacks, partial.get("fallbacks"))
                _merge_fallback_notes(outcome.fallbacks, getattr(exc, "fallbacks", None))
                if partial.get("provider_used"):
                    providers.append(partial["provider_used"])
                outcome.quota_exhausted = True
                quota_hit = True
                _log(f"❌ Unified post-processor (task={task}) stopped: {exc}")
                return
            except Exception as exc:
                _log(f"❌ Unified post-processor (task={task}) failed: {exc}")
                outcome.llm_errors += len(chunk)
                continue
            outcome.llm_written += raw.get("processed", 0)
            outcome.llm_errors += raw.get("errors", 0)
            _merge_fallback_notes(outcome.fallbacks, raw.get("fallbacks"))
            if raw.get("provider_used"):
                providers.append(raw["provider_used"])

    _consume("all", all_task_ids)
    _consume("skills", skills_only_ids)
    seen: List[str] = []
    for name in providers:
        if name not in seen:
            seen.append(name)
    outcome.provider_used = ", ".join(seen) if seen else None

    esco_ids = [j["id"] for j, needs in unprocessed if "skills" in needs]
    if not skip_esco:
        outcome.esco_targeted = len(esco_ids)
    if esco_ids and not skip_esco:
        try:
            from scripts.tag_esco_skills_vector import tag_esco_skills_vector

            esco = tag_esco_skills_vector(job_ids=esco_ids)
            outcome.esco_written = esco.get("processed", 0)
            outcome.esco_errors = esco.get("errors", 0)
        except Exception as exc:
            _log(f"❌ ESCO tagging failed: {exc}")
            outcome.esco_errors = len(esco_ids)

    return outcome


def process_unprocessed_organizations(
    unprocessed: List[Tuple[Dict[str, Any], List[str]]],
) -> OrgPassResult:
    """Assess every (org, needs[]) once and write both fields and skip reason.

    Every attempt writes assessment_skip_reason — NULL when the org came out
    complete, otherwise the reason it parked. Writing on failure is the point:
    previously a failed assessment wrote nothing, so the same orgs were retried
    on every scrape forever.

    Returns an OrgPassResult. ``errors`` counts failed assessments (including
    parks whose result is empty) so existing callers keep the same meaning.
    ``hard_errors`` is only unexpected exceptions and rows that changed mid-run.
    """
    if not unprocessed:
        return OrgPassResult(0, 0, 0)

    _log(f"Assessing {len(unprocessed)} previously-incomplete organizations...")

    from llm.tavily_grounding import is_tavily_available
    from utils.organization_assessment import OrganizationAssessor

    if not is_tavily_available():
        _log("⚠️  Tavily not available — organization assessment may produce degraded results")

    assessor = OrganizationAssessor()

    success = 0
    errors = 0
    parked = 0
    hard_errors = 0
    parked_reasons: List[str] = []
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
                hard_errors += 1
                continue

            if reason is None:
                success += 1
            else:
                parked += 1
                parked_reasons.append(reason)
                if outcome.result is None:
                    errors += 1
                _log(f"  ⏸  Org [{name}] parked: {reason}")
        except Exception as e:
            _log(f"  Org [{name}] error: {e}")
            errors += 1
            hard_errors += 1
            parked += 1
            parked_reasons.append(SKIP_REASON_EXCEPTION)
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

    provider = getattr(assessor, "provider", None)
    fallbacks = getattr(provider, "fallback_notes", None)
    provider_used = getattr(provider, "_last_successful", None)
    if not isinstance(fallbacks, list):
        fallbacks = []
    if not isinstance(provider_used, str):
        provider_used = None

    return OrgPassResult(
        success,
        errors,
        parked,
        tuple(parked_reasons),
        hard_errors,
        tuple(fallbacks),
        provider_used,
    )


# ---------------------------------------------------------------------------
# Main entry point used by scrape.py
# ---------------------------------------------------------------------------


_PARKED_PLAIN = {
    "private_residence": "This name is a home, so there is no organization profile to fill in.",
    "location_mismatch": (
        "The assessment found a different place than the one saved here, "
        "so it did not write a profile."
    ),
    "parse_failed": "The last assessment reply could not be read.",
    "llm_error": "The assessment service failed before it could fill in the profile.",
    "empty_response": "The assessment came back empty.",
    "no_new_fields": "The assessment had nothing new to add, and the profile is still incomplete.",
    "partial_fill": "Part of the profile was filled in. The rest is still missing.",
    "exception": "The assessment crashed before it could finish.",
    "incomplete_backlog": "An earlier pass left this profile incomplete.",
}


def _load_parked_org_rows() -> List[dict]:
    """Organizations whose assessment_skip_reason is set, except an explicit Ignore."""
    resp = (
        supabase.table("organizations")
        .select("id, name, municipality, province, location, website, assessment_skip_reason")
        .not_.is_("assessment_skip_reason", "null")
        .order("id")
        .execute()
    )
    return [
        row for row in (resp.data or [])
        if row.get("assessment_skip_reason") not in (None, "", SKIP_REASON_IGNORED)
    ]


def _parked_place(row: Dict[str, Any]) -> str | None:
    place = ", ".join(
        part for part in (row.get("municipality"), row.get("province")) if part
    )
    return place or row.get("location") or None


def source_jobs_for_org(org_id: Any, *, limit: int = 2) -> List[dict]:
    """Jobs already linked to this organization, so a review can show where the name came from."""
    try:
        resp = (
            supabase.table("jobs")
            .select(
                "job_title,organization,municipality,province,location,listing_url,description"
            )
            .eq("organization_id", org_id)
            .limit(limit)
            .execute()
        )
    except Exception:
        return []
    return [
        row for row in (resp.data or [])
        if row.get("job_title") or row.get("listing_url")
    ]


def source_job_lines(job: Dict[str, Any]) -> List[str]:
    """Short posting context: title, the place stored on the job, the url, and the opening text."""
    place = _parked_place(job) or job.get("location") or "no place stored"
    lines = [
        f"  Job: {job.get('job_title') or '(untitled)'}",
        f"  Employer on the posting: {job.get('organization') or '(blank)'}",
        f"  Place stored on the job: {place}",
    ]
    if job.get("listing_url"):
        lines.append(f"  {job['listing_url']}")
    description = " ".join((job.get("description") or "").split())
    if description:
        snippet = description[:400]
        if len(description) > 400:
            snippet += "…"
        lines.append(f"  {snippet}")
    return lines


def _parked_sentence(row: Dict[str, Any]) -> str:
    reason = row.get("assessment_skip_reason") or ""
    sentence = _PARKED_PLAIN.get(
        reason, f"The scraper stopped on this organization ({reason})."
    )
    if reason == "location_mismatch":
        place = _parked_place(row) or "none saved"
        sentence = f"Saved place is {place}. {sentence}"
    return sentence


def parked_reply_action(reason: str, reply: str) -> str:
    """Map one keypress to ignore, retry, correct, skip, quit, or again."""
    reply = reply.strip().lower()
    if reply in {"q", "quit"}:
        return "quit"
    if reply in {"i", "ignore"}:
        return "ignore"
    if reply in {"c", "correct"}:
        if reason == "location_mismatch":
            return "correct"
        return "again"
    if reply in {"r", "retry"}:
        if reason == "private_residence":
            return "again"
        return "retry"
    if reply == "":
        return "skip"
    return "again"


def suggested_city(row: Dict[str, Any]) -> str:
    """A city already stored on the row that is not the mismatched municipality."""
    location = " ".join((row.get("location") or "").split())
    municipality = " ".join((row.get("municipality") or "").split())
    if not location or "," in location:
        return ""
    if municipality and location.casefold() == municipality.casefold():
        return ""
    return location


def parse_corrected_place(city: str, province: str) -> tuple[str, str] | None:
    """Return (municipality, province code) when both are a city and a Canadian province."""
    from utils.location_parser import _normalize_ca_province_code, is_province_like_municipality

    municipality = " ".join((city or "").split())
    code = _normalize_ca_province_code(province)
    if not municipality or not code or is_province_like_municipality(municipality):
        return None
    return municipality, code


def _set_parked_reason(row: Dict[str, Any], new_reason: str | None) -> bool:
    oid = row["id"]
    read_reason = row.get("assessment_skip_reason")
    query = (
        supabase.table("organizations")
        .update({"assessment_skip_reason": new_reason})
        .eq("id", oid)
    )
    resp = _require_unchanged_reason(query, read_reason).execute()
    return bool(resp.data)


def _read_review_line(prompt: str) -> str | None:
    try:
        return input(prompt)
    except EOFError:
        print("\n(end of input)")
        return None


def _ask_corrected_place(row: Dict[str, Any]) -> tuple[str, str] | None | str:
    """Ask for a city and province. None cancels. ``quit`` leaves the review."""
    suggestion = suggested_city(row)
    city_prompt = f"  City [{suggestion}]: " if suggestion else "  City: "
    city_raw = _read_review_line(city_prompt)
    if city_raw is None:
        return "quit"
    province_raw = _read_review_line("  Province (ON, QC, BC, …): ")
    if province_raw is None:
        return "quit"
    parsed = parse_corrected_place(city_raw.strip() or suggestion, province_raw)
    if parsed is None:
        print("  Need a city and a province. The saved place was left as it is.")
        return None
    return parsed


def _geocode_place(city: str, province: str) -> Dict[str, Any]:
    """Coordinates for a city the reviewer typed. Empty when the geocoder disagrees."""
    try:
        from utils.location_parser import _normalize_ca_province_code, parse_address_with_geocodio

        geo = parse_address_with_geocodio(f"{city}, {province}") or {}
    except Exception as exc:
        _log(f"  Could not geocode {city}, {province}: {exc}")
        return {}
    found = _normalize_ca_province_code(geo.get("province"))
    if found != province or not geo.get("municipality"):
        return {}
    return geo


def _correct_parked_place(row: Dict[str, Any], city: str, province: str) -> str:
    """Write the corrected place onto the organization and its jobs, then assess once."""
    name = row.get("name") or "(unnamed)"
    geo = _geocode_place(city, province)
    if geo.get("municipality"):
        city = geo["municipality"]
    location = f"{city}, {province}"
    payload: Dict[str, Any] = {
        "municipality": city,
        "province": province,
        "location": location,
        "lat": geo.get("lat"),
        "lng": geo.get("lng"),
        "geocode_accuracy_type": geo.get("geocode_accuracy_type"),
        "assessment_skip_reason": None,
    }
    query = supabase.table("organizations").update(payload).eq("id", row["id"])
    resp = _require_unchanged_reason(query, row.get("assessment_skip_reason")).execute()
    if not resp.data:
        return f"Could not update {name}. It stays listed."

    job_payload = {
        key: payload[key]
        for key in ("municipality", "province", "location", "lat", "lng", "geocode_accuracy_type")
    }
    try:
        supabase.table("jobs").update(job_payload).eq("organization_id", row["id"]).execute()
    except Exception as exc:
        _log(f"  Updated {name}, but could not update its jobs: {exc}")

    fresh = _reload_org(row["id"])
    if not fresh:
        return f"Set {name} to {location}, but could not read it back to assess."
    needs = find_missing_org_fields(fresh)
    if not needs:
        return f"Set {name} to {location}. The profile was already complete."
    result = process_unprocessed_organizations([(fresh, needs)])
    if result.success:
        return f"Set {name} to {location} and filled in the profile."
    reason = result.parked_reasons[0] if result.parked_reasons else "unknown"
    detail = _PARKED_PLAIN.get(reason, reason)
    return f"Set {name} to {location}. Assessment is still waiting: {detail}"


def _retry_parked_org(row: Dict[str, Any]) -> str:
    """Clear the flag and assess this organization once, in this run."""
    name = row.get("name") or "(unnamed)"
    if not _set_parked_reason(row, None):
        return f"Could not retry {name}. It stays listed."
    fresh = _reload_org(row["id"])
    if not fresh:
        return f"Cleared {name}, but could not read it back to assess."
    needs = find_missing_org_fields(fresh)
    if not needs:
        return f"{name} already has a full profile."
    result = process_unprocessed_organizations([(fresh, needs)])
    if result.success:
        return f"Filled in {name}."
    reason = result.parked_reasons[0] if result.parked_reasons else "unknown"
    detail = _PARKED_PLAIN.get(reason, reason)
    return f"Tried {name} again. Still waiting: {detail}"


def _prompt_parked_org(row: Dict[str, Any]) -> str:
    reason = row.get("assessment_skip_reason") or ""
    name = row.get("name") or "(unnamed)"
    print(f"\n{name}")
    print(f"  {_parked_sentence(row)}")
    jobs = source_jobs_for_org(row.get("id"))
    if jobs:
        print("  Came from this posting:")
        for job in jobs:
            for line in source_job_lines(job):
                print(line)
    else:
        print("  No job is linked to this organization.")
    if reason == "location_mismatch":
        print(f"  Website: {row.get('website') or 'none'}")
        suggestion = suggested_city(row)
        if suggestion:
            print(f"  c sets the place (suggested city: {suggestion}), updates the job, and assesses.")
        else:
            print("  c sets the place, updates the job, and assesses.")
        print("  r assesses again with the saved place.")
    if reason == "private_residence":
        print("  i = stop listing it    Enter = ask again next scrape    q = stop")
    elif reason == "location_mismatch":
        print(
            "  c = correct the place    r = assess once more now    i = stop listing it    "
            "Enter = ask again next scrape    q = stop"
        )
    else:
        print(
            "  r = assess once more now    i = stop listing it    "
            "Enter = ask again next scrape    q = stop"
        )
    while True:
        try:
            reply = input("> ")
        except EOFError:
            print("\n(end of input)")
            return "quit"
        action = parked_reply_action(reason, reply)
        if action == "correct":
            place = _ask_corrected_place(row)
            if place == "quit":
                return "quit"
            if place is None:
                continue
            city, province = place
            row["_corrected_place"] = (city, province)
            return "correct"
        if action != "again":
            return action
        if reason == "private_residence" and reply.strip().lower() in {"r", "retry"}:
            print("  Assessing this again would stop for the same reason. i takes it off the list.")
        elif reason == "location_mismatch":
            print("  Type c, r, i, or press Enter.")
        else:
            print("  Type r, i, or press Enter.")


def review_parked_organizations(*, interactive: bool) -> List[str]:
    """List organizations the scraper has stopped assessing, and choose when a terminal is attached.

    ``r`` clears the flag and assesses that organization once in this run.
    ``i`` writes ``ignored`` so later runs leave it off the list.
    Enter leaves the flag in place for the next scrape.
    """
    rows = _load_parked_org_rows()
    if not rows:
        return []
    if not interactive:
        lines = [
            "Organizations the scraper will not assess again until you choose:"
        ]
        for row in rows:
            lines.append(f"  {row.get('name') or '(unnamed)'} — {_parked_sentence(row)}")
            for job in source_jobs_for_org(row.get("id")):
                lines.extend(source_job_lines(job))
        lines.append(
            "This run is not a terminal, so nothing was chosen. "
            "Re-run the scraper in a terminal: c corrects the place, r assesses once more, i stops listing it."
        )
        return lines

    print(
        f"\n{len(rows)} organization(s) are waiting on a decision. "
        "The scrape continues either way. Each one is still in the database."
    )
    lines: List[str] = []
    for row in rows:
        name = row.get("name") or "(unnamed)"
        action = _prompt_parked_org(row)
        if action == "quit":
            lines.append(
                "Stopped the organization review. The rest stay listed for the next scrape."
            )
            break
        if action == "ignore":
            if _set_parked_reason(row, SKIP_REASON_IGNORED):
                lines.append(f"Stopped listing {name}.")
            else:
                lines.append(f"Could not update {name}. It stays listed.")
        elif action == "retry":
            lines.append(_retry_parked_org(row))
        elif action == "correct":
            city, province = row.get("_corrected_place") or (None, None)
            if city and province:
                lines.append(_correct_parked_place(row, city, province))
            else:
                lines.append(f"Left {name} for the next scrape.")
        else:
            lines.append(f"Left {name} for the next scrape.")
    return lines


def parked_org_review_lines() -> List[str]:
    """Parked organizations, without prompting. Used when the caller is not a terminal."""
    return review_parked_organizations(interactive=False)


def maintain_organization_duplicates(*, interactive: bool) -> List[str]:
    """Merge exact duplicate organizations, then surface anything a person must confirm.

    Exact same name and compatible website are merged here. ``&`` / ``and`` and
    apostrophe variants are not merged until someone answers ``y`` in the terminal.
    """
    from scripts.merge_duplicate_organizations import (
        apply_auto_merges,
        build_decisions,
        describe_duplicate_reviews,
        review_interactively,
    )

    decisions = build_decisions()
    auto_count = sum(1 for decision in decisions if decision.bucket == "auto-merge")
    lines: List[str] = []
    if auto_count:
        _log(
            f"Merging {auto_count} exact duplicate organization pair(s) "
            "(same name, same website)..."
        )
        apply_auto_merges(decisions)
        lines.append(f"Merged {auto_count} exact duplicate organization pair(s).")

    lines.extend(describe_duplicate_reviews(decisions))
    reviews = [decision for decision in decisions if decision.bucket == "review"]
    if reviews and interactive:
        _log("These organization pairs need a yes or a skip before the jobs can link.")
        review_interactively(decisions, apply=True)
        lines.append("Those pairs were prompted in this run.")
    elif reviews:
        lines.append(
            "This run is not a terminal, so those pairs were not prompted. "
            "Re-run the scraper in a terminal, or: "
            "python -m scripts.merge_duplicate_organizations --prod --needs-review --interactive"
        )
    return lines


def _refresh_job_catch_up(
    unprocessed_jobs: List[Tuple[Dict[str, Any], List[str]]],
    started: float,
) -> tuple[JobCatchUpResult, List[Tuple[Dict[str, Any], List[str]]], List[str]]:
    """Run job catch-up and return the result, what's still missing, and summary lines."""
    job_result = process_unprocessed_jobs(unprocessed_jobs)
    original_ids = {job["id"] for job, _needs in unprocessed_jobs}
    remaining = [
        (job, needs)
        for job, needs in find_unprocessed_jobs()
        if job["id"] in original_ids
    ]
    name_reviews: List[str] = []
    if job_result.unresolved_org_names:
        try:
            from scripts.merge_duplicate_organizations import review_lines_for_names

            name_reviews = review_lines_for_names(job_result.unresolved_org_names)
        except Exception as exc:
            _log(f"  Could not list near-duplicate organization names: {exc}")
    job_lines = job_catch_up_lines(
        len(unprocessed_jobs), job_result, remaining, name_reviews
    )
    job_lines[0] += f" ({time.time() - started:.1f}s)"
    return job_result, remaining, job_lines


def catch_up_unprocessed(*, skip_orgs: bool = False, skip_jobs: bool = False) -> Dict[str, Any]:
    """Find any unprocessed orgs/jobs in the DB and process them after scraping.

    Used automatically by the scraper at the end of each run. Returns a dict
    with counts for logging/reporting.

    Set skip_orgs/skip_jobs to True to disable that pass (useful when you only
    want to scrape new data).
    """
    report: Dict[str, Any] = {
        "orgs_total": 0,
        "orgs_processed": 0,
        "orgs_parked": 0,
        "orgs_errors": 0,
        "jobs_total": 0,
        "jobs_processed": 0,
        "jobs_errors": 0,
        "jobs_still": 0,
        "org_lines": [],
        "job_lines": [],
        "review_lines": [],
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
            org_result = process_unprocessed_organizations(unprocessed_orgs)
            report["orgs_processed"] = org_result.success
            report["orgs_errors"] = org_result.errors
            report["orgs_parked"] = org_result.parked
            org_lines = org_catch_up_lines(
                len(unprocessed_orgs),
                org_result.success,
                org_result.parked,
                org_result.parked_reasons,
                org_result.hard_errors,
                org_result.fallbacks,
                org_result.provider_used,
            )
            org_lines[0] += f" ({time.time() - t0:.1f}s)"
            report["org_lines"] = org_lines
            for line in org_lines:
                _log(line)
        else:
            _log("✅ No organizations eligible for assessment.")

    # ── 2. Exact duplicate orgs, then anything a person still has to confirm ──
    if not skip_jobs:
        import sys

        review_lines: List[str] = []
        try:
            review_lines.extend(
                maintain_organization_duplicates(interactive=sys.stdin.isatty())
            )
        except Exception as exc:
            _log(f"Organization duplicate check failed: {exc}")
        try:
            review_lines.extend(
                review_parked_organizations(interactive=sys.stdin.isatty())
            )
        except Exception as exc:
            _log(f"Could not list parked organizations: {exc}")
        if not any(line.strip() for line in review_lines):
            review_lines = ["Manual review: nothing waiting."]
        else:
            review_lines = ["Manual review", *review_lines]
        report["review_lines"] = review_lines
        for line in review_lines:
            _log(line)

        t0 = time.time()
        unprocessed_jobs = find_unprocessed_jobs()
        report["jobs_total"] = len(unprocessed_jobs)
        if unprocessed_jobs:
            _log(f"Found {len(unprocessed_jobs)} unprocessed jobs — processing after scraping new data")
            job_result, remaining, job_lines = _refresh_job_catch_up(unprocessed_jobs, t0)
            report["job_lines"] = job_lines
            report["jobs_processed"] = len(unprocessed_jobs) - len(remaining)
            report["jobs_still"] = len(remaining)
            report["jobs_errors"] = (
                job_result.llm_errors + job_result.esco_errors + job_result.org_errors
            )
            for line in job_lines:
                _log(line)
        else:
            _log("✅ All jobs already processed.")

    return report
