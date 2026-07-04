"""SSE (Solidarity Economy) classifier for organizations.

Evaluates an organization entity against the same SSE principles used for
job classification, but with a prompt tailored to assess the organization
itself (governance model, mission, values) rather than a specific job posting.

# TODO: consolidate with SSEClassifier — the JSON parsing, retry logic, and
# error handling are shared. A future refactor could extract a base class or
# parameterized helper. Kept separate for now because SSEClassifier has
# job-specific batch mode, required-description checks, and prompt fields
# that would make parameterization awkward without a larger refactor.

Requirements: 5.1, 5.2, 5.3
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from llm.base import LLMProviderError
from llm.factory import get_sse_provider
from utils.sse_classifier import SSEClassificationError, SSEClassificationResult
from utils.sse_prompts import EVALUATION_CRITERIA, SSE_PRINCIPLES

logger = logging.getLogger(__name__)

# Same keywords used by SSEClassifier for grounded web search
SSE_SEARCH_KEYWORDS = '(governance OR bylaws OR "articles of incorporation" OR "annual report" OR "impact report" OR "board of directors")'

# Rating guidelines tailored to organizations (not job postings)
_ORG_RATING_GUIDELINES = """Be strict:
- "strong_yes" requires clear organizational commitment to SSE principles: nonprofit, cooperative, community-based, or social enterprise with explicit mission/values aligned to solidarity economy.
- "weak_yes" for: organizations with some SSE alignment but mixed signals — e.g. mission-driven but traditional corporate structure, or environmental focus without democratic governance.
- "no" for: profit-focused, no social/environmental/community mission, or insufficient information to determine SSE alignment."""

# JSON output spec (reuses the same shape as SSEClassifier)
_ORG_JSON_SPEC = """{
  "rating": "strong_yes",
  "confidence": 0.85,
  "reasoning": "Brief explanation of rating based on organization's mission, governance, and values (max 200 chars).",
  "must_haves_met": ["list", "of", "criteria"],
  "nice_to_haves_met": ["list", "of", "criteria"],
  "flags": ["any concerns", "ambiguities", "missing info"]
}"""

_ORG_JSON_INSTRUCTIONS = """IMPORTANT:
- Return ONLY the JSON output, no commentary.
- Escape any double quotes inside string values (use \\" or replace with single quotes).
- Do not include trailing commas or extra text outside the JSON.
"""


def _build_org_classification_prompt(org: dict) -> str:
    """Build the SSE classification prompt for an organization entity."""
    name = org.get("name", "Unknown")
    description = org.get("description") or "Not available"
    org_type = org.get("type") or "Not specified"
    website = org.get("website") or "Not available"
    values = org.get("values") or "Not available"

    return f"""You are evaluating whether an organization aligns with Solidarity Economy (SSE) principles.

{SSE_PRINCIPLES}

{EVALUATION_CRITERIA}

ANALYZE THIS ORGANIZATION:

Organization Name: {name}
Type: {org_type}
Website: {website}
Description:
{description[:5000]}

Values/Mission:
{values[:3000] if isinstance(values, str) else values}

OUTPUT FORMAT (valid JSON only):
{_ORG_JSON_SPEC}

{_ORG_JSON_INSTRUCTIONS}

{_ORG_RATING_GUIDELINES}
"""


class OrganizationSSEClassifier:
    """Classifies organizations as SSE-aligned or not using grounded LLM.

    Uses the same provider pipeline as SSEClassifier (Gemini with web search
    in production, local grounded provider in local mode) but with a prompt
    tailored to evaluate the organization as an entity.

    Example:
        classifier = OrganizationSSEClassifier()
        result = classifier.classify({
            "name": "The Depot Community Food Centre",
            "description": "A community food centre...",
            "type": "nonprofit",
            "website": "https://depot.ca",
            "values": "Community empowerment...",
        })
        # result["rating"] == "strong_yes"

    Requirements: 5.1, 5.3
    """

    def __init__(self) -> None:
        """Initialize using get_sse_provider() — same as SSEClassifier.

        Raises:
            SSEClassificationError: If no SSE provider is available.
        """
        provider = get_sse_provider()
        if not provider:
            raise SSEClassificationError(
                "SSE provider not available for org classification. "
                "Check API keys (GEMINI_API_KEY, GROQ_API_KEY, TAVILY_API_KEY)."
            )
        self.provider = provider

    def classify(self, org: dict) -> SSEClassificationResult:
        """Classify an organization entity against SSE criteria.

        Args:
            org: Dict with keys: name, description, type, website, values.

        Returns:
            SSEClassificationResult with rating, confidence, reasoning, and details.
            Also includes is_sse derived from rating.

        Raises:
            SSEClassificationError: On API errors (rate limit, auth).

        Requirements: 5.1, 5.2, 5.3
        """
        org_name = org.get("name", "Unknown")
        prompt = _build_org_classification_prompt(org)

        # Build grounded search query — same pattern as SSEClassifier
        search_query = f'"{org_name}" {SSE_SEARCH_KEYWORDS}'

        last_error_message = ""
        for attempt in range(2):
            try:
                response_text = self.provider.complete(
                    prompt,
                    system="You are an expert at analyzing organizations for Solidarity Economy alignment.",
                    task="sse",
                    search_query=search_query,
                ).strip()
            except LLMProviderError as e:
                raise SSEClassificationError(f"LLM provider error: {e}") from e
            except Exception as e:
                err_msg_raw = str(e)
                err_msg = err_msg_raw.lower()
                if "429" in err_msg or "resource_exhausted" in err_msg or "quota" in err_msg:
                    raise SSEClassificationError(
                        f"API rate limit or quota exceeded. Try again later. Raw error: {err_msg_raw}"
                    ) from e
                if "403" in err_msg or "permission" in err_msg:
                    raise SSEClassificationError(
                        f"API key invalid or permission denied. Raw error: {err_msg_raw}"
                    ) from e
                raise SSEClassificationError(f"LLM API error: {err_msg_raw}") from e

            parsed_result, parse_error = self._safe_parse_response(response_text, org_name)
            if parsed_result is not None:
                return parsed_result
            last_error_message = parse_error or "Unknown parse error"
            logger.warning(
                "Org SSE parse error (attempt %d/2) for %r: %s",
                attempt + 1, org_name, last_error_message,
            )

        return self._default_failed_classification(org_name, last_error_message)

    # ---- Parsing helpers ----

    def _safe_parse_response(
        self, response_text: str, org_name: str,
    ) -> tuple[SSEClassificationResult | None, str | None]:
        """Return (result, error_message)."""
        try:
            return self._parse_response(response_text, org_name), None
        except (json.JSONDecodeError, ValueError) as e:
            return None, str(e)

    def _parse_response(self, response_text: str, org_name: str) -> SSEClassificationResult:
        """Parse and validate a single-org JSON response.

        Reuses the same validation logic as SSEClassifier._parse_sse_response.
        """
        text = response_text.strip()
        match = re.search(r"^```(?:json)?\s*([\s\S]*?)\s*```\s*$", text, re.IGNORECASE)
        if match:
            text = match.group(1).strip()

        data = json.loads(text)

        required = ["rating", "confidence", "reasoning", "must_haves_met", "flags"]
        for field in required:
            if field not in data:
                raise ValueError(f"Missing required field: {field}")

        rating = str(data.get("rating") or "").lower().strip()
        if rating not in ("strong_yes", "weak_yes", "no"):
            raise ValueError(f"Invalid rating: {rating} (must be strong_yes, weak_yes, or no)")

        must_haves = data.get("must_haves_met", [])
        if not isinstance(must_haves, list):
            must_haves = []

        nice_to_haves = data.get("nice_to_haves_met", [])
        if not isinstance(nice_to_haves, list):
            nice_to_haves = []

        flags = data.get("flags", [])
        if not isinstance(flags, list):
            flags = []

        confidence = max(0.0, min(1.0, float(data.get("confidence", 0.5))))

        return {
            "rating": rating,
            "confidence": confidence,
            "reasoning": str(data.get("reasoning", "No reasoning provided")),
            "must_haves_met": [str(m) for m in must_haves],
            "nice_to_haves_met": [str(n) for n in nice_to_haves],
            "flags": [str(f) for f in flags],
            "classified_at": datetime.now(timezone.utc).isoformat(),
            "reviewed": False,
        }

    @staticmethod
    def _default_failed_classification(
        org_name: str, reason: str | None = None,
    ) -> SSEClassificationResult:
        reasoning = "Unable to classify organization: failed to parse classifier output."
        return {
            "rating": "no",
            "confidence": 0.5,
            "reasoning": reasoning,
            "must_haves_met": [],
            "nice_to_haves_met": [],
            "flags": ["classification_failed"],
            "classified_at": datetime.now(timezone.utc).isoformat(),
            "reviewed": False,
        }


def is_sse_from_rating(rating: str) -> bool:
    """Derive is_sse from sse_rating.

    is_sse = True iff rating is "strong_yes" or "weak_yes".

    Requirements: 5.2
    """
    return rating in ("strong_yes", "weak_yes")
