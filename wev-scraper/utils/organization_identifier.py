"""LLM-grounded organization identification.

Uses the same provider factory as SSEClassifier (get_sse_provider()) to
identify organizations from scraped job data via a web-search-grounded prompt.

Requirements: 4.1, 4.2, 4.4, 4.5, 4.6
"""

from __future__ import annotations

import json
import logging
import re
from typing import TypedDict

from llm.factory import get_sse_provider
from utils.sse_prompts import JSON_INSTRUCTIONS

logger = logging.getLogger(__name__)

# Accepted organization type values
ORG_TYPE_VALUES = (
    "nonprofit",
    "cooperative",
    "social enterprise",
    "government",
    "union",
    "other",
)

# Max characters of job description sent to the LLM prompt.
# NOTE: the stored description field in organizations is capped at 300 chars
# (enforced in the resolver before INSERT). This 1000-char limit is only for
# the prompt INPUT — do not conflate the two.
_PROMPT_DESC_MAX_CHARS = 1000

_ORG_IDENTIFICATION_PROMPT = """\
You are identifying an employer organization from scraped job data.
Your goal is to find the canonical name, web presence, and classify the \
organization type.

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
  "type": "One of: nonprofit, cooperative, social enterprise, government, union, other — or null"
}}

{json_instructions}
"""


class OrgIdentificationResult(TypedDict):
    """Parsed LLM result for an organization identification call.

    NOTE: description here is the stored value (max 300 chars).
    The prompt input description is truncated separately at 1000 chars.
    """

    canonical_name: str
    slug: str
    website: str | None
    description: str | None  # max 300 chars — stored in organizations.description
    type: str | None  # "nonprofit"|"cooperative"|"social enterprise"|"government"|"union"|"other"


class OrganizationIdentifier:
    """Calls the grounded LLM to identify organizations from job metadata.

    Requirements: 4.1, 4.2, 4.4, 4.5, 4.6
    """

    def __init__(self) -> None:
        self.provider = get_sse_provider()
        if not self.provider:
            raise RuntimeError(
                "SSE provider not available for OrganizationIdentifier. "
                "Check API keys (GEMINI_API_KEY, GROQ_API_KEY, TAVILY_API_KEY)."
            )

    def identify(
        self,
        raw_name: str,
        municipality: str | None,
        province: str | None,
        job_title: str,
        description: str,
    ) -> OrgIdentificationResult | None:
        """Return a parsed LLM result or None on failure.

        The description input is truncated to _PROMPT_DESC_MAX_CHARS (1000 chars)
        before being sent to the LLM — the stored description field is capped at
        300 chars separately in the resolver.

        Requirements: 4.1, 4.5
        """
        prompt = _ORG_IDENTIFICATION_PROMPT.format(
            raw_name=raw_name,
            municipality=municipality or "",
            province=province or "",
            job_title=job_title,
            description=description[:_PROMPT_DESC_MAX_CHARS],
            json_instructions=JSON_INSTRUCTIONS,
        )

        search_query = f'"{raw_name}"'
        if municipality:
            search_query += f" {municipality}"
        if province:
            search_query += f" {province}"

        try:
            response_text = self.provider.complete(
                prompt,
                system="You are an expert at identifying employer organizations from job postings.",
                task="org_identification",
                search_query=search_query,
            ).strip()
        except Exception as exc:
            logger.warning(
                "OrganizationIdentifier LLM call failed for %r: %s",
                raw_name,
                exc,
            )
            return None

        return self._parse_response(response_text, raw_name)

    def _parse_response(
        self, response_text: str, raw_name: str
    ) -> OrgIdentificationResult | None:
        """Validate and parse the LLM JSON response.

        Returns a valid result iff:
          - response parses as JSON
          - canonical_name is a non-empty string

        Requirements: 2.5
        """
        text = response_text.strip()
        # Strip markdown fences if present — unanchored so preamble/postamble
        # before/after the code block is discarded (common with LLM output).
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if match:
            text = match.group(1).strip()

        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.warning(
                "OrganizationIdentifier: failed to parse JSON for %r: %s — response: %r",
                raw_name,
                exc,
                response_text[:200],
            )
            return None

        if not isinstance(data, dict):
            logger.warning(
                "OrganizationIdentifier: expected dict, got %s for %r",
                type(data),
                raw_name,
            )
            return None

        canonical_name = data.get("canonical_name")
        if not canonical_name or not str(canonical_name).strip():
            logger.warning(
                "OrganizationIdentifier: empty canonical_name for %r — data: %r",
                raw_name,
                data,
            )
            return None

        # Normalize type
        raw_type = data.get("type")
        org_type = str(raw_type).strip().lower() if raw_type else None
        if org_type not in ORG_TYPE_VALUES:
            org_type = None

        # Cap description at 300 chars (stored field limit)
        raw_description = data.get("description")
        description = str(raw_description)[:300] if raw_description else None

        return OrgIdentificationResult(
            canonical_name=str(canonical_name).strip(),
            slug=str(data.get("slug") or "").strip(),
            website=str(data["website"]).strip() if data.get("website") else None,
            description=description,
            type=org_type,
        )
