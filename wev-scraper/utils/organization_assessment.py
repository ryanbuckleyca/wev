"""Single grounded LLM call for organization assessment.

Replaces OrganizationIdentifier + OrganizationSSEClassifier with one call that:
- Identifies the org (canonical name, slug, website, description, type)
- Extracts mission statement
- Maps values to the Knowdell taxonomy
- Produces SSE rating

Requirements: 4.1, 4.2, 4.4, 4.5, 5.1, 5.2, 5.3
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Any, List, TypedDict, Optional
from urllib.parse import urlparse

from llm.base import LLMProviderError
from llm.factory import get_sse_provider
from utils.base_grounded_classifier import BaseGroundedClassifier, SSEClassificationError
from utils.job_values_prompts import get_taxonomy, get_work_values_set
from utils.sector_prompts import get_formatted_sector_taxonomy, get_sector_ids_set
from utils.organization_cache import evidence_domain
from utils.slug import generate_slug
from utils.location_parser import parse_address_with_geocodio
from utils.sse_prompts import (
    JSON_INSTRUCTIONS,
    LENGTH_LIMITED_FIELD_RULES,
    ORG_EVALUATION_CRITERIA,
    ORG_RATING_GUIDELINES,
    SSE_PRINCIPLES,
)

logger = logging.getLogger(__name__)

ORG_TYPE_VALUES = (
    "nonprofit",
    "cooperative",
    "social enterprise",
    "government",
    "union",
    "other",
)

# Soft length targets for LLM output (paraphrase to fit). Keep in sync with
# wev-bulletin/lib/organizations/constants.ts where applicable. Callers must
# never hard-truncate these fields after generation.
_ORG_DESCRIPTION_MAX_CHARS = 500
_ORG_MISSION_MAX_CHARS = 500
_ORG_VALUES_RAW_MAX_CHARS = 1000
# Short evidence summary only — criterion lists live in must_haves_met / nice_to_haves_met.
_SSE_REASONING_MAX_CHARS = 400

# Truncate job-listing notes fed into the prompt only (not stored org fields).
_PROMPT_DESC_MAX_CHARS = 1000

_JSON_FIELDS = f"""{{
  "canonical_name": "Official organization name (string, required, non-empty)",
  "slug": "url-safe-kebab-case (string, required)",
  "website": "Employer's own homepage URL (https://...), or null — see WEBSITE RULES",
  "description": "Organization description (max {_ORG_DESCRIPTION_MAX_CHARS} characters — paraphrase to fit completely; do not truncate), or null",
  "mission_statement": "Organization mission/purpose (max {_ORG_MISSION_MAX_CHARS} characters — paraphrase to fit completely; do not truncate), or null",
  "type": "One of: nonprofit, cooperative, social enterprise, government, union, other — or null",
  "sector_id": "Sector ID from the ALLOWED SECTORS list below, or null if none fit well",
  "values_raw": "Organization values and principles if found on their website (max {_ORG_VALUES_RAW_MAX_CHARS} characters — paraphrase to fit completely; do not truncate), or null",
  "values": ["List of mapped Knowdell work values (see taxonomy below), max 5 values"],
  "sse_rating": "strong_yes or weak_yes or no",
  "sse_confidence": "0.0 to 1.0",
  "sse_reasoning": "2–4 concise sentences citing the key evidence for the rating (max {_SSE_REASONING_MAX_CHARS} characters — paraphrase to fit completely; do not truncate). Do NOT restate must_haves_met or nice_to_haves_met — those belong only in their arrays",
  "must_haves_met": ["short labels of must-have criteria met — not prose paragraphs"],
  "nice_to_haves_met": ["short labels of nice-to-have criteria met — not prose paragraphs"],
  "flags": ["any concerns", "ambiguities", "missing info"]
}}"""

_WEBSITE_RULES = """WEBSITE RULES for the "website" field:
- Prefer the organization's own official homepage (the domain they control).
- If ORGANIZATION DATA lists a Known website, prefer that URL unless it violates
  the rules below (shared/ATS/social) — then discover a better employer-owned site.
- Do NOT use job-board, ATS, or careers-platform URLs (e.g. Greenhouse, Lever,
  Workday, Indeed, CharityVillage, LinkedIn jobs).
- Do NOT use social profiles or link aggregators (Facebook, Instagram, LinkedIn
  company pages, Linktree, bit.ly) unless that is truly their only web presence
  — in that case return null instead (social hosts are not reliable identity).
- Do NOT use the scraped job listing URL.
- If you cannot confidently identify the employer-owned site, return null.
- Prefer https:// and the apex/homepage over a deep job posting path."""

_combined_prompt = """You are evaluating an ORGANIZATION (employer), not a job posting.
Identify the organization, extract its values and mission from research about the
org itself, and assess its Solidarity Economy (SSE) alignment.

{SSE_PRINCIPLES}

{ORG_EVALUATION_CRITERIA}

{ORG_RATING_GUIDELINES}

ORGANIZATION DATA:
  Raw name:    {raw_name}
  Municipality: {municipality}
  Province:     {province}
  Known website: {known_website}
  Job title (identity hint only — ignore for SSE rating): {job_title}
  Org/listing notes (identity hint only — ignore for SSE rating):
{description}

Return a JSON object with exactly these fields:
{json_fields}

ALLOWED SECTORS for the "sector_id" field:
{sector_taxonomy_formatted}

ALLOWED VALUES for the "values" field (use ONLY labels from this list):
{taxonomy_formatted}

RULES for the "values" field:
- Values must exactly match labels from the ALLOWED VALUES list above (case-sensitive).
- Choose 3 to 5 values that best describe the organization based on its mission,
  description, website content, and overall purpose.
- Do NOT include labels not in the ALLOWED VALUES list.
- Do NOT include duplicates.
- "Help Society" and "Community" are distinct — use both if evidence supports both.
- Be honest: if you can't determine values from the available information,
  return an empty array.

{website_rules}

{length_limited_field_rules}

{JSON_INSTRUCTIONS}
"""


class AssessedOrgResult(TypedDict):
    canonical_name: str
    slug: str
    website: str | None
    description: str | None
    mission_statement: str | None
    type: str | None
    sector_id: str | None
    values_raw: str | None
    values: List[str]
    sse_rating: str
    sse_confidence: float
    sse_reasoning: str
    must_haves_met: List[str]
    nice_to_haves_met: List[str]
    flags: List[str]


_TAXONOMY_STR: str | None = None


def _format_taxonomy() -> str:
    global _TAXONOMY_STR
    if _TAXONOMY_STR is None:
        lines: list[str] = []
        for v in get_taxonomy():
            lines.append(f'{v.label}: {v.definition}')
        _TAXONOMY_STR = "\n".join(lines)
    return _TAXONOMY_STR


def _build_assessment_prompt(
    raw_name: str,
    municipality: str | None,
    province: str | None,
    job_title: str,
    description: str,
    known_website: str | None = None,
) -> str:
    known = ""
    if known_website and evidence_domain(known_website):
        known = known_website.strip()
    return _combined_prompt.format(
        SSE_PRINCIPLES=SSE_PRINCIPLES,
        ORG_EVALUATION_CRITERIA=ORG_EVALUATION_CRITERIA,
        ORG_RATING_GUIDELINES=ORG_RATING_GUIDELINES,
        raw_name=raw_name,
        municipality=municipality or "",
        province=province or "",
        known_website=known or "(none — discover the employer-owned homepage)",
        job_title=job_title,
        description=description[:_PROMPT_DESC_MAX_CHARS],
        json_fields=_JSON_FIELDS,
        sector_taxonomy_formatted=get_formatted_sector_taxonomy(),
        taxonomy_formatted=_format_taxonomy(),
        website_rules=_WEBSITE_RULES,
        JSON_INSTRUCTIONS=JSON_INSTRUCTIONS,
        length_limited_field_rules=LENGTH_LIMITED_FIELD_RULES,
    )


def _build_search_query(
    raw_name: str,
    municipality: str | None = None,
    province: str | None = None,
    known_website: str | None = None,
) -> str:
    """Grounding query aimed at the employer's own site, not the job board."""
    parts = [f'"{raw_name}"', "official website"]
    if municipality:
        parts.append(municipality)
    if province:
        parts.append(province)
    if known_website and evidence_domain(known_website):
        parts.append(known_website.strip())
    return " ".join(parts)


def _normalize_type(raw: Any) -> str | None:
    org_type = str(raw).strip().lower() if raw else None
    return org_type if org_type in ORG_TYPE_VALUES else None


def _normalize_values(raw_values: Any, valid_set: set[str]) -> list[str]:
    if not isinstance(raw_values, list):
        return []
    seen: set[str] = set()
    values: list[str] = []
    for v in raw_values:
        label = str(v).strip() if v else ""
        if label in valid_set and label not in seen:
            seen.add(label)
            values.append(label)
    return values[:5]


def _validate_sse_rating(raw: Any) -> str:
    rating = str(raw or "").lower().strip()
    return rating if rating in ("strong_yes", "weak_yes", "no") else "no"


# Eligible org types for any SSE "yes". Conventional for-profits map to "other".
_SSE_ELIGIBLE_ORG_TYPES = frozenset({
    "nonprofit",
    "cooperative",
    "social enterprise",
    "union",
})


def _apply_org_sse_governance_guard(result: AssessedOrgResult) -> AssessedOrgResult:
    """Force 'no' when a yes rating lacks eligible SSE governance type."""
    if result["sse_rating"] == "no":
        return result
    org_type = result.get("type")
    if org_type in _SSE_ELIGIBLE_ORG_TYPES:
        return result

    flags = list(result.get("flags") or [])
    flags.append("governance_gate: non-SSE org type cannot be SSE yes")
    reasoning = (result.get("sse_reasoning") or "").rstrip()
    note = (
        " Overridden to 'no': organization type "
        f"{org_type!r} is not an eligible SSE governance form "
        "(nonprofit, cooperative, social enterprise, or union); "
        "CSR/environmental language alone is insufficient."
    )
    return AssessedOrgResult(
        **{
            **result,
            "sse_rating": "no",
            "flags": flags,
            "sse_reasoning": reasoning + note,
        }
    )


def _parse_text_field(data: dict, key: str) -> str | None:
    val = data.get(key)
    if val:
        return str(val).strip()
    return None


# Soft limits are prompt guidance only — never hard-truncate stored fields.
# Log when the LLM overshoots so we can monitor prompt compliance.
_SOFT_LIMIT_FIELDS: tuple[tuple[str, int], ...] = (
    ("description", _ORG_DESCRIPTION_MAX_CHARS),
    ("mission_statement", _ORG_MISSION_MAX_CHARS),
    ("values_raw", _ORG_VALUES_RAW_MAX_CHARS),
    ("sse_reasoning", _SSE_REASONING_MAX_CHARS),
)


def _warn_over_soft_limits(result: AssessedOrgResult, raw_name: str) -> None:
    for field, max_chars in _SOFT_LIMIT_FIELDS:
        value = result.get(field)
        if isinstance(value, str) and len(value) > max_chars:
            logger.warning(
                "OrganizationAssessor: %s exceeds soft limit for %r: "
                "len=%d max=%d (kept untruncated)",
                field,
                raw_name,
                len(value),
                max_chars,
            )


def _parse_website(raw: Any) -> str | None:
    """Keep only http(s) employer-owned sites; drop ATS/social/shared hosts."""
    if not raw:
        return None
    url = str(raw).strip()
    if not url:
        return None
    if "://" not in url:
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None
    if evidence_domain(url) is None:
        logger.info(
            "OrganizationAssessor: rejecting non-evidence website %r",
            url,
        )
        return None
    return url


def _ensure_str_list(raw: Any) -> list[str]:
    return [str(item) for item in (raw if isinstance(raw, list) else [])]


def _clamp_confidence(raw: Any) -> float:
    if raw is None:
        return 0.5
    try:
        return max(0.0, min(1.0, float(raw)))
    except (TypeError, ValueError):
        return 0.5


def _parse_response(response_text: str, raw_name: str) -> AssessedOrgResult | None:
    text = BaseGroundedClassifier._extract_json_block(response_text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.warning(
            "OrganizationAssessor: failed to parse JSON for %r: %s — response: %r",
            raw_name, exc, response_text[:200],
        )
        return None

    if not isinstance(data, dict):
        logger.warning(
            "OrganizationAssessor: expected dict, got %s for %r",
            type(data).__name__, raw_name,
        )
        return None

    canonical_name = data.get("canonical_name")
    if not isinstance(canonical_name, str) or not canonical_name.strip():
        logger.warning(
            "OrganizationAssessor: empty canonical_name for %r",
            raw_name,
        )
        return None

    slug = _parse_text_field(data, "slug") or ""
    if not slug:
        slug = generate_slug(canonical_name)
        logger.warning(
            "OrganizationAssessor: LLM returned no slug for canonical_name=%r raw_name=%r — generated slug=%r",
            canonical_name, raw_name, slug,
        )

    result = AssessedOrgResult(
        canonical_name=canonical_name.strip(),
        slug=slug,
        website=_parse_website(data.get("website")),
        description=_parse_text_field(data, "description"),
        mission_statement=_parse_text_field(data, "mission_statement"),
        type=_normalize_type(data.get("type")),
        sector_id=data.get("sector_id") if data.get("sector_id") in get_sector_ids_set() else None,
        values_raw=_parse_text_field(data, "values_raw"),
        values=_normalize_values(data.get("values", []), get_work_values_set()),
        sse_rating=_validate_sse_rating(data.get("sse_rating")),
        sse_confidence=_clamp_confidence(data.get("sse_confidence")),
        sse_reasoning=(
            _parse_text_field(data, "sse_reasoning") or "No reasoning provided"
        ),
        must_haves_met=_ensure_str_list(data.get("must_haves_met")),
        nice_to_haves_met=_ensure_str_list(data.get("nice_to_haves_met")),
        flags=_ensure_str_list(data.get("flags")),
    )
    _warn_over_soft_limits(result, raw_name)
    return _apply_org_sse_governance_guard(result)


def _result_to_db_fields(result: AssessedOrgResult) -> dict:
    return {
        "description": result["description"],
        "mission_statement": result["mission_statement"],
        "type": result["type"],
        "sector_id": result["sector_id"],
        "values": result["values_raw"],
        "values_list": result["values"],
        "values_rated": [{"value": v, "rank": i + 1} for i, v in enumerate(result["values"])] if result["values"] else None,
        "sse_rating": result["sse_rating"],
        "is_sse": result["sse_rating"] in ("strong_yes", "weak_yes"),
        "sse_details": {
            "confidence": result["sse_confidence"],
            "reasoning": result["sse_reasoning"],
            "must_haves_met": result["must_haves_met"],
            "nice_to_haves_met": result["nice_to_haves_met"],
            "flags": result["flags"],
            "classified_at": datetime.now(timezone.utc).isoformat(),
            "reviewed": False,
        },
    }


class OrganizationAssessor(BaseGroundedClassifier):
    """Single grounded LLM call: identifies org, maps values, produces SSE rating."""

    def __init__(self) -> None:
        self.provider = get_sse_provider()
        if not self.provider:
            raise SSEClassificationError(
                "SSE provider not available for OrganizationAssessor. "
                "Check API keys (GEMINI_API_KEY, GROQ_API_KEY, TAVILY_API_KEY)."
            )

    def assess(
        self,
        raw_name: str,
        municipality: str | None = None,
        province: str | None = None,
        job_title: str = "",
        description: str = "",
        known_website: str | None = None,
    ) -> AssessedOrgResult | None:
        prompt = _build_assessment_prompt(
            raw_name,
            municipality,
            province,
            job_title,
            description,
            known_website=known_website,
        )
        search_query = _build_search_query(
            raw_name, municipality, province, known_website=known_website,
        )

        try:
            response_text = self._call_provider_with_retry(
                provider=self.provider,
                prompt=prompt,
                system=(
                    "You are an expert at identifying organizations, finding their "
                    "official employer-owned website, mapping work values, and "
                    "evaluating Solidarity Economy alignment of the ORGANIZATION "
                    "(not job-posting completeness)."
                ),
                task="sse",
                search_query=search_query,
                retries=1,
            )
        except (SSEClassificationError, LLMProviderError) as exc:
            logger.warning(
                "OrganizationAssessor LLM call failed for %r: %s",
                raw_name, exc,
            )
            return None

        return _parse_response(response_text, raw_name)

    def assess_and_build_row(
        self,
        raw_name: str,
        municipality: str | None = None,
        province: str | None = None,
        job_title: str = "",
        description: str = "",
        canonical_loc: str = "",
        known_website: str | None = None,
    ) -> dict | None:
        """Assess the org and return a row dict ready for DB insert.

        Returns None if the LLM call fails (caller should use minimal fallback).
        """
        result = self.assess(
            raw_name,
            municipality,
            province,
            job_title,
            description,
            known_website=known_website,
        )
        if result is None:
            return None

        loc_str = canonical_loc or None
        # parse_address_with_geocodio always returns a complete dict (municipality, province,
        # lat, lng, geocode_accuracy_type); it handles None/empty internally.
        geo_data = parse_address_with_geocodio(loc_str)

        return {
            "name": result["canonical_name"],
            "slug": result["slug"],
            "location": loc_str,
            "website": result["website"],
            "municipality": geo_data.get("municipality"),
            "province": geo_data.get("province"),
            "lat": geo_data.get("lat"),
            "lng": geo_data.get("lng"),
            "geocode_accuracy_type": geo_data.get("geocode_accuracy_type"),
            **_result_to_db_fields(result),
        }

    def assess_and_build_update(
        self,
        org: dict,
    ) -> dict | None:
        """Re-assess an existing org and return an update dict.

        Includes website when the assessor returns an employer-owned host.
        Passes the org's current website (if evidence-grade) into search/prompt.
        """
        name = org.get("name")
        if not name:
            logger.warning(
                "assess_and_build_update: org_id=%s has no name, skipping", org.get("id"),
            )
            return None
        known_website = org.get("website")
        result = self.assess(
            raw_name=name,
            municipality=org.get("municipality"),
            province=org.get("province"),
            job_title="",
            description=org.get("description") or "",
            known_website=known_website,
        )
        if result is None:
            return None

        updates = _result_to_db_fields(result)
        website = result.get("website")
        if website and evidence_domain(website):
            updates["website"] = website
        return updates
