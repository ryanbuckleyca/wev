"""Job SSE eligibility.

In the Social and Solidarity Economy field (ILO, UNTFSSE, RIPESS, CIRIEC),
SSE is an *enterprise / organization* category — cooperatives, mutuals,
associations, and similar democratically governed entities. Employment is
"in the SSE" when the employer is an SSE organization. A role at a
non-SSE employer (conventional for-profit, government, etc.) is not an
SSE job, even when the work is mission-flavored or CSR-branded.

This module enforces that product rule at write time: ``jobs.is_sse`` may
be true only when the linked organization's ``is_sse`` is true.
"""

from __future__ import annotations

from typing import Any

ORG_SSE_GATE_FLAG = "gated_by_org_is_sse"
ORG_SSE_DEFER_FLAG = "deferred_org_sse_unassessed"


def resolve_job_is_sse(
    proposed: bool | None,
    org_is_sse: bool | None,
) -> bool | None:
    """Return the ``is_sse`` value to persist for a job.

    - Proposed false stays false (an SSE org may host non-SSE roles).
    - Proposed true requires ``org_is_sse is True``.
    - Proposed true with ``org_is_sse is False`` → false (hard gate).
    - Proposed true with ``org_is_sse is None`` (org missing / unassessed)
      → None so the caller can omit the write and retry after org assessment.
    - Proposed None → None.
    """
    if proposed is not True:
        return False if proposed is False else None
    if org_is_sse is True:
        return True
    if org_is_sse is False:
        return False
    return None


def job_sse_was_gated(proposed: bool | None, resolved: bool | None) -> bool:
    """True when a yes was forced to no because the employer is not SSE."""
    return proposed is True and resolved is False


def job_sse_was_deferred(proposed: bool | None, resolved: bool | None) -> bool:
    """True when a yes was held back until the org is assessed."""
    return proposed is True and resolved is None


def annotate_sse_details_flags(
    flags: list[Any] | None,
    *,
    gated: bool = False,
    deferred: bool = False,
) -> list[str]:
    """Copy flags and append org-SSE gate provenance markers."""
    out = [str(f) for f in (flags or [])]
    if gated and ORG_SSE_GATE_FLAG not in out:
        out.append(ORG_SSE_GATE_FLAG)
    if deferred and ORG_SSE_DEFER_FLAG not in out:
        out.append(ORG_SSE_DEFER_FLAG)
    return out


def org_is_sse_from_job_row(job: dict[str, Any] | None) -> bool | None:
    """Read linked org ``is_sse`` from a job row (embed or flat key).

    Supports PostgREST ``organizations(is_sse)`` embeds (object) and a
    pre-joined ``org_is_sse`` key used in tests / batch maps.
    """
    if not job:
        return None
    if "org_is_sse" in job:
        raw = job.get("org_is_sse")
        if raw is None:
            return None
        return bool(raw)
    embedded = job.get("organizations")
    if isinstance(embedded, dict):
        raw = embedded.get("is_sse")
        if raw is None:
            return None
        return bool(raw)
    if isinstance(embedded, list) and embedded:
        first = embedded[0]
        if isinstance(first, dict):
            raw = first.get("is_sse")
            if raw is None:
                return None
            return bool(raw)
    return None


def demote_org_job_sse(supabase: Any, organization_id: Any) -> int:
    """Force ``is_sse=false`` on all SSE jobs for a non-SSE organization.

    Returns the number of rows updated (best-effort; 0 on empty/failure).
    """
    if organization_id is None:
        return 0
    try:
        resp = (
            supabase.table("jobs")
            .update({"is_sse": False})
            .eq("organization_id", organization_id)
            .eq("is_sse", True)
            .execute()
        )
    except Exception:
        return 0
    data = getattr(resp, "data", None) or []
    return len(data)


def apply_job_sse_org_gate(
    *,
    proposed_is_sse: bool | None,
    org_is_sse: bool | None,
    flags: list[Any] | None = None,
) -> tuple[bool | None, list[str], bool]:
    """Resolve job SSE against org SSE and annotate flags.

    Returns ``(resolved_is_sse, flags, deferred)``. When ``deferred`` is True,
    callers should omit ``is_sse`` (and usually the whole SSE write) so the job
    remains eligible for catch-up after the org is assessed.
    """
    resolved = resolve_job_is_sse(proposed_is_sse, org_is_sse)
    deferred = job_sse_was_deferred(proposed_is_sse, resolved)
    gated = job_sse_was_gated(proposed_is_sse, resolved)
    out_flags = annotate_sse_details_flags(flags, gated=gated, deferred=deferred)
    return resolved, out_flags, deferred
