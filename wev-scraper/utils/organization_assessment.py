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
from typing import Any, List, TypedDict
from urllib.parse import urlparse

from llm.factory import get_sse_provider
from utils.job_values_prompts import get_work_values_set, get_taxonomy
from utils.sse_prompts import SSE_PRINCIPLES, EVALUATION_CRITERIA, SSE_SEARCH_KEYWORDS, JSON_INSTRUCTIONS

logger = logging.getLogger(__name__)

ORG_TYPE_VALUES = (
    "nonprofit",
    "cooperative",
    "social enterprise",
    "government",
    "union",
    "other",
)

_PROMPT_DESC_MAX_CHARS = 1000

_combined_prompt = """You are evaluating an organization from scraped job data.
Your goal is to identify the organization, extract its values and mission,
 and assess its Solidarity Economy (SSE) alignment.

{SSE_PRINCIPLES}

{EVALUATION_CRITERIA}

ORGANIZATION DATA:
  Raw name:    {raw_name}
  Municipality: {municipality}
  Province:     {province}
  Job title:   {job_title}
  Job description (truncated):
{description}

Return a JSON object with exactly these fields:
{{
  "canonical_name": "Official organization name (string, required, non-empty)",
  "slug": "url-safe-kebab-case (string, required)",
  "website": "https://... or null",
  "description": "Brief organization description, max 300 characters, or null",
  "mission_statement": "Organization mission/purpose statement, max 500 characters, or null",
  "type": "One of: nonprofit, cooperative, social enterprise, government, union, other — or null",
  "values_raw": "Organization values and principles if found on their website, max 1000 characters, or null",
  "values": ["List of mapped Knowdell work values (see taxonomy below), max 5 values"],
  "sse_rating": "strong_yes or weak_yes or no",
  "sse_confidence": "0.0 to 1.0",
  "sse_reasoning": "Brief explanation of SSE rating citing specific evidence, max 200 chars",
  "must_haves_met": ["list of criteria met"],
  "nice_to_haves_met": ["list of criteria met"],
  "flags": ["any concerns", "ambiguities", "missing info"]
}}

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

{JSON_INSTRUCTIONS}
"""


class AssessedOrgResult(TypedDict):
    canonical_name: str
    slug: str
    website: str | None
    description: str | None
    mission_statement: str | None
    type: str | None
    values_raw: str | None
    values: List[str]
    sse_rating: str
    sse_confidence: float
    sse_reasoning: str
    must_haves_met: List[str]
    nice_to_haves_met: List[str]
    flags: List[str]


def _format_taxonomy() -> str:
    lines: list[str] = []
    for v in get_taxonomy():
        lines.append(f'{v.label}: {v.definition}')
    return "\n".join(lines)


def _build_assessment_prompt(
    raw_name: str,
    municipality: str | None,
    province: str | None,
    job_title: str,
    description: str,
) -> str:
    return _combined_prompt.format(
        SSE_PRINCIPLES=SSE_PRINCIPLES,
        EVALUATION_CRITERIA=EVALUATION_CRITERIA,
        raw_name=raw_name,
        municipality=municipality or "",
        province=province or "",
        job_title=job_title,
        description=description[:_PROMPT_DESC_MAX_CHARS],
        taxonomy_formatted=_format_taxonomy(),
        JSON_INSTRUCTIONS=JSON_INSTRUCTIONS,
    )


def _parse_response(response_text: str, raw_name: str) -> AssessedOrgResult | None:
    text = response_text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if match:
        text = match.group(1).strip()

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

    raw_type = data.get("type")
    org_type = str(raw_type).strip().lower() if raw_type else None
    if org_type not in ORG_TYPE_VALUES:
        org_type = None

    slug = str(data.get("slug") or "").strip()
    canonical_name = canonical_name.strip()

    raw_website = data.get("website")
    web = None
    if raw_website:
        parsed = urlparse(str(raw_website).strip())
        if parsed.scheme in ("http", "https"):
            web = str(raw_website).strip()

    desc = data.get("description")
    if desc:
        desc = str(desc)[:300].strip()

    mission = data.get("mission_statement")
    if mission:
        mission = str(mission)[:500].strip()

    values_raw = data.get("values_raw")
    if values_raw:
        values_raw = str(values_raw)[:1000].strip()

    valid_set = get_work_values_set()
    raw_values = data.get("values", [])
    if not isinstance(raw_values, list):
        raw_values = []
    values: list[str] = []
    seen: set[str] = set()
    for v in raw_values:
        label = str(v).strip() if v else ""
        if label in valid_set and label not in seen:
            seen.add(label)
            values.append(label)
    values = values[:5]

    rating = str(data.get("sse_rating") or "").lower().strip()
    if rating not in ("strong_yes", "weak_yes", "no"):
        logger.warning(
            "OrganizationAssessor: invalid sse_rating %r for %r, defaulting to 'no'",
            rating, raw_name,
        )
        rating = "no"

    confidence = max(0.0, min(1.0, float(data.get("sse_confidence", 0.5))))
    reasoning = str(data.get("sse_reasoning") or "No reasoning provided")[:200]

    must_haves = data.get("must_haves_met", [])
    nice_to_haves = data.get("nice_to_haves_met", [])
    flags = data.get("flags", [])

    return AssessedOrgResult(
        canonical_name=canonical_name,
        slug=slug,
        website=web,
        description=desc or None,
        mission_statement=mission or None,
        type=org_type,
        values_raw=values_raw or None,
        values=values,
        sse_rating=rating,
        sse_confidence=confidence,
        sse_reasoning=reasoning,
        must_haves_met=[str(m) for m in (must_haves if isinstance(must_haves, list) else [])],
        nice_to_haves_met=[str(n) for n in (nice_to_haves if isinstance(nice_to_haves, list) else [])],
        flags=[str(f) for f in (flags if isinstance(flags, list) else [])],
    )


def _build_sse_details(result: AssessedOrgResult) -> dict[str, Any]:
    return {
        "confidence": result["sse_confidence"],
        "reasoning": result["sse_reasoning"],
        "must_haves_met": result["must_haves_met"],
        "nice_to_haves_met": result["nice_to_haves_met"],
        "flags": result["flags"],
        "classified_at": datetime.now(timezone.utc).isoformat(),
        "reviewed": False,
    }


def _build_values_rated(values: list[str]) -> list[dict[str, Any]]:
    return [{"value": v, "confidence": i + 1} for i, v in enumerate(values)]


class OrganizationAssessor:
    """Single grounded LLM call: identifies org, maps values, produces SSE rating."""

    def __init__(self) -> None:
        self.provider = get_sse_provider()
        if not self.provider:
            raise RuntimeError(
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
    ) -> AssessedOrgResult | None:
        prompt = _build_assessment_prompt(raw_name, municipality, province, job_title, description)

        search_query = f'"{raw_name}"'
        if municipality:
            search_query += f" {municipality}"
        if province:
            search_query += f" {province}"

        try:
            response_text = self.provider.complete(
                prompt,
                system="You are an expert at identifying organizations, mapping work values, and evaluating Solidarity Economy alignment.",
                task="sse",
                search_query=search_query,
            ).strip()
        except Exception as exc:
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
    ) -> dict | None:
        """Assess the org and return a row dict ready for DB insert.

        Returns None if the LLM call fails (caller should use minimal fallback).
        """
        result = self.assess(raw_name, municipality, province, job_title, description)
        if result is None:
            return None

        return {
            "name": result["canonical_name"],
            "slug": result["slug"],
            "location": canonical_loc or None,
            "website": result["website"],
            "description": result["description"],
            "mission_statement": result["mission_statement"],
            "type": result["type"],
            "values": result["values_raw"],
            "values_list": result["values"],
            "values_rated": _build_values_rated(result["values"]) if result["values"] else None,
            "sse_rating": result["sse_rating"],
            "is_sse": result["sse_rating"] in ("strong_yes", "weak_yes"),
            "sse_details": _build_sse_details(result),
        }

    def assess_and_build_update(
        self,
        org: dict,
    ) -> dict | None:
        """Re-assess an existing org and return an update dict.

        Used by the backfill script for orgs created before the combined
        assessor existed (null sse_rating).
        """
        name = org.get("name", "Unknown")
        result = self.assess(
            raw_name=name,
            municipality=None,
            province=None,
            job_title="",
            description=org.get("description") or "",
        )
        if result is None:
            return None

        return {
            "description": result["description"],
            "mission_statement": result["mission_statement"],
            "type": result["type"],
            "values": result["values_raw"],
            "values_list": result["values"],
            "values_rated": _build_values_rated(result["values"]) if result["values"] else None,
            "sse_rating": result["sse_rating"],
            "is_sse": result["sse_rating"] in ("strong_yes", "weak_yes"),
            "sse_details": _build_sse_details(result),
        }
