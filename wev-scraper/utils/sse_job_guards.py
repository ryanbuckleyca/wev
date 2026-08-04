"""Deterministic post-guards for job SSE ratings (shared across providers).

These catch liberal model outputs that violate hard rubric gates Gemini already
respects: conventional for-profit admissions and missing compensation disclosure.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from utils.sse_classifier import SSEClassificationResult

_MISSING_SALARY_RE = re.compile(
    r"^\s*(?:n/?a|not\s+specified|none|unknown|tbd|to\s+be\s+determined|"
    r"null|unspecified|see\s+(?:posting|description)|-+\.?|\.?)\s*$",
    re.IGNORECASE,
)

_VOLUNTEER_OR_INTERN_RE = re.compile(
    r"\b(?:"
    r"volunteer(?:ing|s)?|volontaire(?:s)?"
    r"|internship|internships|intern\b|stagiaire|stage\b"
    r"|unpaid\s+(?:role|position|placement|opportunity)"
    r")\b",
    re.IGNORECASE,
)

# Pay signals in salary field or description body.
_PAY_SIGNAL_RE = re.compile(
    r"(?:"
    r"[\$€£]|CAD|USD|EUR|GBP"
    r"|\b(?:per|/)\s*(?:hour|hr|semaine|week|month|mois|year|an(?:née|nee)?|annum)\b"
    r"|\b(?:hourly|salary|salarie|salaire|wage|compensation|rémunération|remuneration)\b"
    r"|\b\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?\s*(?:\$|CAD|USD)?"
    r"|\b\d+(?:\.\d+)?\s*(?:\$|CAD)?\s*(?:/\s*)?(?:hr|hour|h)\b"
    r")",
    re.IGNORECASE,
)

_FOR_PROFIT_ADMISSION_RE = re.compile(
    r"(?:"
    r"for[\s-]?profit"
    r"|privately\s+owned"
    r"|private\s+(?:business|company|farm|enterprise|consultancy|corporation)"
    r"|founder[\s-]?owned"
    r"|family\s+farm"
    r"|commercial\s+(?:farm|enterprise|business|grower|tour\s*company)"
    r"|conventional\s+(?:for[\s-]?profit|business|company|wilderness|tour)"
    r"|market\s+garden"
    r"|private\s+consultancy"
    r")",
    re.IGNORECASE,
)

_MISSING_COMP_FLAG_RE = re.compile(
    r"(?:"
    r"missing\s+compensat"
    r"|compensation\s+(?:missing|undisclosed|not\s+disclosed|opaque|vague)"
    r"|no\s+(?:wage|salary|pay|compensation)"
    r"|opaque(?:/|\s+)?(?:or\s+)?missing\s+compensat"
    r"|undisclosed\s+(?:pay|wage|salary|compensation)"
    r")",
    re.IGNORECASE,
)


def salary_is_missing(salary: str | None) -> bool:
    """True when the salary field is empty or a placeholder (N/A, Not specified, …)."""
    if salary is None:
        return True
    text = str(salary).strip()
    if not text:
        return True
    return bool(_MISSING_SALARY_RE.match(text))


def description_discloses_volunteer_or_internship(description: str | None) -> bool:
    if not description:
        return False
    return bool(_VOLUNTEER_OR_INTERN_RE.search(description))


def text_has_pay_signal(text: str | None) -> bool:
    if not text:
        return False
    return bool(_PAY_SIGNAL_RE.search(text))


def compensation_is_incomplete(
    *,
    salary: str | None,
    description: str | None,
) -> bool:
    """Hard incomplete-pay gate: no salary field, no body pay cue, not volunteer/intern."""
    if description_discloses_volunteer_or_internship(description):
        return False
    if not salary_is_missing(salary):
        # Salary field present — still require it to look like pay (reject junk).
        if text_has_pay_signal(salary):
            return False
        # Non-empty but non-pay salary (e.g. "Competitive") — check body.
        if text_has_pay_signal(description):
            return False
        return True
    # Missing salary field: body must disclose pay or volunteer/intern.
    return not text_has_pay_signal(description)


def _evidence_blob(result: dict) -> str:
    parts: list[str] = []
    for key in ("reasoning", "flags", "must_haves_met", "nice_to_haves_met"):
        raw = result.get(key)
        if isinstance(raw, list):
            parts.extend(str(x) for x in raw if x is not None)
        elif isinstance(raw, str) and raw.strip():
            parts.append(raw)
    return " ".join(parts)


def apply_job_sse_guards(
    result: SSEClassificationResult,
    *,
    salary: str | None = None,
    description: str | None = None,
) -> SSEClassificationResult:
    """Force rating to ``no`` when hard job gates are violated.

    Guards (only demote Yes → no; never promote):
    1. Missing/opaque compensation without volunteer/internship disclosure
    2. Model reasoning/flags that admit conventional for-profit / private farm /
       commercial employer while still rating Yes
    3. Model flags that admit missing compensation while still rating Yes
    """
    rating = str(result.get("rating") or "").lower().strip()
    if rating not in ("strong_yes", "weak_yes"):
        return result

    flags = [str(f) for f in (result.get("flags") or []) if f is not None]
    blob = _evidence_blob(result)

    if compensation_is_incomplete(salary=salary, description=description):
        flags.append(
            "compensation_gate: missing/opaque pay without volunteer/internship "
            "disclosure — forced no"
        )
        return {
            **result,
            "rating": "no",
            "flags": flags,
        }

    if _MISSING_COMP_FLAG_RE.search(blob):
        flags.append(
            "compensation_gate: model flagged missing compensation — forced no"
        )
        return {
            **result,
            "rating": "no",
            "flags": flags,
        }

    if _FOR_PROFIT_ADMISSION_RE.search(blob):
        flags.append(
            "governance_gate: model admitted conventional for-profit / private "
            "commercial employer — forced no"
        )
        return {
            **result,
            "rating": "no",
            "flags": flags,
        }

    return result
