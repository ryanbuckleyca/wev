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

# Map normalized keys (spaces/hyphens stripped) → canonical stored type.
# Mutual / community labels alias to nonprofit until a taxonomy branch
# introduces dedicated terms.
_ORG_TYPE_ALIASES: dict[str, str] = {
    "nonprofit": "nonprofit",
    "cooperative": "cooperative",
    "socialenterprise": "social enterprise",
    "mutual": "nonprofit",
    "mutualaid": "nonprofit",
    "mutualaidgroup": "nonprofit",
    "mutualsociety": "nonprofit",
    "community": "nonprofit",
    "communityassociation": "nonprofit",
    "communityproject": "nonprofit",
    "creditunion": "cooperative",
    "union": "union",
    "government": "government",
    "other": "other",
}

# Hard length limits for stored LLM fields. Keep in sync with
# wev-bulletin/lib/organizations/constants.ts (description/mission).
# Prompt asks the model to paraphrase within the limit. If it overshoots,
# assess() runs a repair paraphrase call — never mid-text truncation.
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
  "description_en": "Organization description in English (max {_ORG_DESCRIPTION_MAX_CHARS} characters — paraphrase to fit completely; do not truncate), or null",
  "description_fr": "Same description in French (max {_ORG_DESCRIPTION_MAX_CHARS} characters — paraphrase to fit completely; do not truncate), or null",
  "mission_statement_en": "Organization mission/purpose in English (max {_ORG_MISSION_MAX_CHARS} characters — paraphrase to fit completely; do not truncate), or null",
  "mission_statement_fr": "Same mission/purpose in French (max {_ORG_MISSION_MAX_CHARS} characters — paraphrase to fit completely; do not truncate), or null",
  "type": "One of: nonprofit, cooperative, social enterprise, government, union, other — or null. Map mutual societies, mutual-aid groups, and community associations/projects to nonprofit (or cooperative if clearly a coop/credit union). Use other only for conventional for-profit / residual forms",
  "sector_id": "Sector ID from the ALLOWED SECTORS list below, or null if none fit well",
  "values_raw": "Organization values and principles if found on their website (max {_ORG_VALUES_RAW_MAX_CHARS} characters — paraphrase to fit completely; do not truncate), or null",
  "values": ["List of mapped Knowdell work values (see taxonomy below), max 5 values"],
  "sse_rating": "strong_yes or weak_yes or no",
  "sse_confidence": "0.0 to 1.0",
  "sse_reasoning_en": "2–4 concise English sentences citing the key evidence for the rating (max {_SSE_REASONING_MAX_CHARS} characters — paraphrase to fit completely; do not truncate). Do NOT restate must_haves_met or nice_to_haves_met — those belong only in their arrays",
  "sse_reasoning_fr": "Same reasoning in French (max {_SSE_REASONING_MAX_CHARS} characters — paraphrase to fit completely; do not truncate)",
  "must_haves_met": ["short labels of must-have criteria met — not prose paragraphs"],
  "nice_to_haves_met": ["short labels of nice-to-have criteria met — not prose paragraphs"],
  "flags": ["any concerns", "ambiguities", "missing info"]
}}"""

_BILINGUAL_COPY_RULES = """BILINGUAL PUBLIC COPY (required):
- Always provide BOTH English and French for description_*, mission_statement_*, and sse_reasoning_* when you have enough evidence to write the field at all.
- If you can write the English version, also write the French version (and vice versa) — do not leave one locale null when the other is present.
- Write natural French (not word-for-word calque) and natural English.
- Knowdell "values" labels stay in English (taxonomy keys). values_raw may stay in the source language of the website.
- must_haves_met / nice_to_haves_met / flags stay in English short labels."""

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

{bilingual_copy_rules}

{length_limited_field_rules}

{JSON_INSTRUCTIONS}
"""


class AssessedOrgResult(TypedDict):
    canonical_name: str
    slug: str
    website: str | None
    description_en: str | None
    description_fr: str | None
    mission_statement_en: str | None
    mission_statement_fr: str | None
    type: str | None
    sector_id: str | None
    values_raw: str | None
    values: List[str]
    sse_rating: str
    sse_confidence: float
    sse_reasoning_en: str
    sse_reasoning_fr: str
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
        bilingual_copy_rules=_BILINGUAL_COPY_RULES,
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
    if not raw:
        return None
    key = re.sub(r"[\s_-]+", "", str(raw).strip().lower())
    return _ORG_TYPE_ALIASES.get(key)


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


# Known types that can never be SSE yes. Null/unknown type is NOT in this set.
# Eligible stored types (must agree with ORG_EVALUATION_CRITERIA): nonprofit,
# cooperative, social enterprise, union.
_SSE_INELIGIBLE_ORG_TYPES = frozenset({
    "government",
    "other",
})


def _apply_org_sse_governance_guard(result: AssessedOrgResult) -> AssessedOrgResult:
    """Force 'no' only when type is known and ineligible for SSE yes."""
    if result["sse_rating"] == "no":
        return result
    org_type = result.get("type")
    if org_type is None:
        # Unknown type — do not demote a model Yes.
        return result
    if org_type not in _SSE_INELIGIBLE_ORG_TYPES:
        return result

    flags = list(result.get("flags") or [])
    flags.append(
        "governance_gate: non-SSE org type cannot be SSE yes "
        f"(type={org_type!r}; government and other are never SSE; "
        "eligible: nonprofit, cooperative, social enterprise, union)"
    )
    return AssessedOrgResult(
        **{
            **result,
            "sse_rating": "no",
            "flags": flags,
        }
    )


_LENGTH_LIMITED_FIELDS: tuple[tuple[str, int], ...] = (
    ("description_en", _ORG_DESCRIPTION_MAX_CHARS),
    ("description_fr", _ORG_DESCRIPTION_MAX_CHARS),
    ("mission_statement_en", _ORG_MISSION_MAX_CHARS),
    ("mission_statement_fr", _ORG_MISSION_MAX_CHARS),
    ("values_raw", _ORG_VALUES_RAW_MAX_CHARS),
    ("sse_reasoning_en", _SSE_REASONING_MAX_CHARS),
    ("sse_reasoning_fr", _SSE_REASONING_MAX_CHARS),
)


def _fields_over_limit(result: AssessedOrgResult) -> dict[str, tuple[str, int]]:
    """Return {field: (text, max_chars)} for length-limited fields that overshoot."""
    over: dict[str, tuple[str, int]] = {}
    for field, max_chars in _LENGTH_LIMITED_FIELDS:
        value = result.get(field)
        if isinstance(value, str) and len(value) > max_chars:
            over[field] = (value, max_chars)
    return over


def _build_length_repair_prompt(oversize: dict[str, tuple[str, int]]) -> str:
    payload = {
        field: {
            "max_chars": max_chars,
            "current_len": len(text),
            "text": text,
        }
        for field, (text, max_chars) in oversize.items()
    }
    return (
        "The following JSON fields exceed their max character counts. "
        "Rewrite each value so the ENTIRE string fits within max_chars.\n\n"
        "Rules:\n"
        "- Paraphrase and condense; keep vital facts; do not invent details.\n"
        "- Complete sentences only — never cut mid-word or mid-sentence.\n"
        "- Return ONLY a JSON object with the same keys and string values.\n"
        "- Every returned string MUST be <= its max_chars.\n\n"
        f"Fields:\n{json.dumps(payload, ensure_ascii=False)}"
    )


def _parse_length_repair_response(
    response_text: str,
    oversize: dict[str, tuple[str, int]],
) -> dict[str, str]:
    """Parse repair JSON; keep only keys that fit their max_chars."""
    text = BaseGroundedClassifier._extract_json_block(response_text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    repaired: dict[str, str] = {}
    for field, (_, max_chars) in oversize.items():
        raw = data.get(field)
        if not isinstance(raw, str):
            continue
        cleaned = raw.strip()
        if cleaned and len(cleaned) <= max_chars:
            repaired[field] = cleaned
    return repaired


def _apply_length_repairs(
    result: AssessedOrgResult,
    oversize: dict[str, tuple[str, int]],
    repaired: dict[str, str],
    raw_name: str,
) -> AssessedOrgResult:
    """Apply successful repairs; drop fields that still do not fit (no truncation).

    Dropped fields are set to None (or a short sse_reasoning fallback) and flagged
    ``length_limit: dropped <field> ...``. Callers that update existing rows should
    omit those keys so prior DB values are retained — see
    ``_omit_dropped_length_fields_from_update``.
    """
    updates: dict[str, Any] = {}
    flags = list(result.get("flags") or [])
    for field, (original, max_chars) in oversize.items():
        new_val = repaired.get(field)
        if new_val is not None:
            updates[field] = new_val
            continue
        logger.warning(
            "OrganizationAssessor: %s still over limit for %r after repair "
            "(len=%d max=%d) — dropping field rather than truncating",
            field,
            raw_name,
            len(original),
            max_chars,
        )
        if field in ("sse_reasoning_en", "sse_reasoning_fr"):
            updates[field] = "No reasoning provided" if field.endswith("_en") else "Aucun raisonnement fourni"
        else:
            updates[field] = None
        flags.append(f"length_limit: dropped {field} after failed paraphrase repair")
    if not updates and flags == list(result.get("flags") or []):
        return result
    return AssessedOrgResult(**{**result, **updates, "flags": flags})


# AssessedOrgResult field → organizations update column(s) to skip when repair drops.
_LENGTH_DROP_UPDATE_KEYS: dict[str, tuple[str, ...]] = {
    "description_en": ("description_en", "description"),
    "description_fr": ("description_fr",),
    "mission_statement_en": ("mission_statement_en", "mission_statement"),
    "mission_statement_fr": ("mission_statement_fr",),
    "values_raw": ("values",),
    # sse_reasoning_* live inside sse_details; keep short fallbacks there.
}


def _omit_dropped_length_fields_from_update(
    updates: dict,
    result: AssessedOrgResult,
) -> dict:
    """Remove fields the repair pass dropped so reassess does not null existing DB text."""
    omit: set[str] = set()
    for flag in result.get("flags") or []:
        if not flag.startswith("length_limit: dropped "):
            continue
        # "length_limit: dropped description after failed paraphrase repair"
        parts = flag.split()
        field = parts[2] if len(parts) > 2 else ""
        omit.update(_LENGTH_DROP_UPDATE_KEYS.get(field, ()))
    if not omit:
        return updates
    return {key: value for key, value in updates.items() if key not in omit}

def _parse_text_field(data: dict, key: str) -> str | None:
    val = data.get(key)
    if val:
        text = str(val).strip()
        return text or None
    return None


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


def _parse_localized_text(data: dict, key_en: str, key_fr: str, legacy_key: str) -> tuple[str | None, str | None]:
    """Prefer explicit *_en/*_fr; fall back to legacy monolingual key as English."""
    en = _parse_text_field(data, key_en)
    fr = _parse_text_field(data, key_fr)
    if en is None and fr is None:
        en = _parse_text_field(data, legacy_key)
    return en, fr


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

    description_en, description_fr = _parse_localized_text(
        data, "description_en", "description_fr", "description"
    )
    mission_en, mission_fr = _parse_localized_text(
        data, "mission_statement_en", "mission_statement_fr", "mission_statement"
    )
    reasoning_en, reasoning_fr = _parse_localized_text(
        data, "sse_reasoning_en", "sse_reasoning_fr", "sse_reasoning"
    )

    result = AssessedOrgResult(
        canonical_name=canonical_name.strip(),
        slug=slug,
        website=_parse_website(data.get("website")),
        description_en=description_en,
        description_fr=description_fr,
        mission_statement_en=mission_en,
        mission_statement_fr=mission_fr,
        type=_normalize_type(data.get("type")),
        sector_id=data.get("sector_id") if data.get("sector_id") in get_sector_ids_set() else None,
        values_raw=_parse_text_field(data, "values_raw"),
        values=_normalize_values(data.get("values", []), get_work_values_set()),
        sse_rating=_validate_sse_rating(data.get("sse_rating")),
        sse_confidence=_clamp_confidence(data.get("sse_confidence")),
        sse_reasoning_en=reasoning_en or "No reasoning provided",
        sse_reasoning_fr=reasoning_fr or "Aucun raisonnement fourni",
        must_haves_met=_ensure_str_list(data.get("must_haves_met")),
        nice_to_haves_met=_ensure_str_list(data.get("nice_to_haves_met")),
        flags=_ensure_str_list(data.get("flags")),
    )
    return _apply_org_sse_governance_guard(result)


def _result_to_db_fields(result: AssessedOrgResult) -> dict:
    description_en = result["description_en"]
    description_fr = result["description_fr"]
    mission_en = result["mission_statement_en"]
    mission_fr = result["mission_statement_fr"]
    reasoning_en = result["sse_reasoning_en"]
    reasoning_fr = result["sse_reasoning_fr"]
    return {
        "description_en": description_en,
        "description_fr": description_fr,
        # Legacy columns: prefer English, else French, for search/compat readers.
        "description": description_en or description_fr,
        "mission_statement_en": mission_en,
        "mission_statement_fr": mission_fr,
        "mission_statement": mission_en or mission_fr,
        "type": result["type"],
        "sector_id": result["sector_id"],
        "values": result["values_raw"],
        "values_list": result["values"],
        "values_rated": [{"value": v, "rank": i + 1} for i, v in enumerate(result["values"])] if result["values"] else None,
        "sse_rating": result["sse_rating"],
        "is_sse": result["sse_rating"] in ("strong_yes", "weak_yes"),
        "sse_details": {
            "confidence": result["sse_confidence"],
            "reasoning": reasoning_en or reasoning_fr,
            "reasoning_en": reasoning_en,
            "reasoning_fr": reasoning_fr,
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

        result = _parse_response(response_text, raw_name)
        if result is None:
            return None
        return self._ensure_length_limits(result, raw_name)

    def _ensure_length_limits(
        self,
        result: AssessedOrgResult,
        raw_name: str,
    ) -> AssessedOrgResult:
        """Paraphrase any over-limit fields via a repair call; never truncate."""
        oversize = _fields_over_limit(result)
        if not oversize:
            return result

        logger.info(
            "OrganizationAssessor: paraphrasing over-limit fields for %r: %s",
            raw_name,
            {field: len(text) for field, (text, _) in oversize.items()},
        )
        repaired: dict[str, str] = {}
        try:
            repair_text = self._call_provider_with_retry(
                provider=self.provider,
                prompt=_build_length_repair_prompt(oversize),
                system=(
                    "You rewrite text to fit strict character limits. "
                    "Return JSON only. Never truncate mid-sentence — paraphrase."
                ),
                task="sse",
                search_query=None,
                retries=0,
            )
            repaired = _parse_length_repair_response(repair_text, oversize)
        except (SSEClassificationError, LLMProviderError) as exc:
            logger.warning(
                "OrganizationAssessor: length repair LLM call failed for %r: %s",
                raw_name,
                exc,
            )

        return _apply_length_repairs(result, oversize, repaired, raw_name)

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
            description=org.get("description_en")
            or org.get("description_fr")
            or org.get("description")
            or "",
            known_website=known_website,
        )
        if result is None:
            return None

        updates = _result_to_db_fields(result)
        updates = _omit_dropped_length_fields_from_update(updates, result)
        website = result.get("website")
        if website and evidence_domain(website):
            updates["website"] = website
        return updates
