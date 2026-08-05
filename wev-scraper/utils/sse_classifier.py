"""SSE (Solidarity Economy) job classifier using Gemini API."""

import json
import logging
import re
from datetime import datetime, timezone
from typing import TypedDict

from llm.factory import get_sse_provider
from utils.base_grounded_classifier import BaseGroundedClassifier, SSEClassificationError
from utils.sse_prompts import (
    get_sse_batch_classification_prompt,
    get_sse_classification_prompt,
)

logger = logging.getLogger(__name__)


class SSEDetails(TypedDict, total=False):
    """Structure of sse_details JSONB column in database."""
    confidence: float
    reasoning: str
    must_haves_met: list[str]
    nice_to_haves_met: list[str]
    flags: list[str]
    classified_at: str
    reviewed: bool


class SSEClassificationResult(TypedDict):
    """Full classification result including rating and details."""
    rating: str  # "strong_yes", "weak_yes", "no"
    confidence: float
    reasoning: str
    must_haves_met: list[str]
    nice_to_haves_met: list[str]
    flags: list[str]
    classified_at: str
    reviewed: bool


# Models sometimes false-no clear charities solely for missing wage lines.
_COMPENSATION_OPACITY_RE = re.compile(
    r"transparent compensation|compensation|wage|salary|pay disclosure|"
    r"opaque(?:/missing)? compensation|missing compensation|no salary|"
    r"wage disclosure|pay (?:not|never) (?:stated|disclosed)|"
    r"lacks? (?:transparent )?compensation",
    re.IGNORECASE,
)
_GOVERNANCE_INELIGIBLE_RE = re.compile(
    r"for[- ]profit|government|public[- ]sector|crown corp|municipality|"
    r"corporate|consultancy|private company|traditional corporation",
    re.IGNORECASE,
)
_NONPROFIT_EMPLOYER_RE = re.compile(
    r"non[- ]?profit|not[- ]for[- ]profit|charity|charitable|"
    r"community (?:agency|organization|organisation|centre|center|food)|"
    r"human services|social services|social[- ]services|"
    r"\bagency\b|\bagence\b|cooperative|co[- ]op|credit union|"
    r"mutual[- ]aid|solidarity",
    re.IGNORECASE,
)
_HIDDEN_UNPAID_RE = re.compile(
    r"unpaid trial|hidden unpaid|undisclosed volunteer|unpaid work without",
    re.IGNORECASE,
)


def _apply_nonprofit_compensation_guard(
    result: SSEClassificationResult,
    *,
    org_name: str = "",
) -> SSEClassificationResult:
    """Upgrade false-no when a nonprofit was rejected only for thin/missing pay.

    Clear charities / community social-services agencies should land at least
    weak_yes when the only cited gap is opaque compensation (not hidden unpaid
    work, and not governance-ineligible employers).
    """
    if result.get("rating") != "no":
        return result

    reasoning = str(result.get("reasoning") or "")
    flags = [str(f) for f in (result.get("flags") or [])]
    blob = " ".join([reasoning, " ".join(flags), org_name or ""])

    if not _COMPENSATION_OPACITY_RE.search(blob):
        return result
    if _HIDDEN_UNPAID_RE.search(blob):
        return result
    # Keep "no" when reasoning says for-profit/gov unless the employer name
    # itself clearly marks a nonprofit/agency (name wins over CSR noise).
    if _GOVERNANCE_INELIGIBLE_RE.search(blob) and not _NONPROFIT_EMPLOYER_RE.search(
        org_name or ""
    ):
        return result
    if not _NONPROFIT_EMPLOYER_RE.search(blob):
        return result

    new_flags = list(flags)
    new_flags.append(
        "compensation_guard: nonprofit/charity employer — thin/missing wage "
        "disclosure alone must not force no → weak_yes"
    )
    return {
        **result,
        "rating": "weak_yes",
        "flags": new_flags,
    }

class SSEClassifier(BaseGroundedClassifier):
    """Classifies jobs as Corporate vs SSE-aligned using Gemini.

    Example:
        classifier = SSEClassifier()
        result = classifier.classify_job({
            "org_name": "The Depot Community Food Center",
            "title": "Urban Agriculture Assistant",
            "location": "Toronto, ON",
            "salary": "$22.25/hr, 28h/week",
            "description": "Help develop urban agriculture...",
            "posted_date": "2026-02-01"
        })
        # result["rating"] == "strong_yes"
    """

    def __init__(self, model: str | None = None):
        """Initialize classifier with SSE provider (grounding required).

        Uses local provider in test mode, cloud providers otherwise with automatic fallback.
        """
        provider = get_sse_provider()  # Uses local or cloud provider with fallback
        if not provider:
            raise SSEClassificationError(
                "SSE provider not available. Check API keys (GEMINI_API_KEY, GROQ_API_KEY, TAVILY_API_KEY)."
            )
        self.provider = provider

    def classify_job(self, job_data: dict) -> SSEClassificationResult:
        """Classify a single job as SSE-aligned or not.

        Args:
            job_data: Dict with keys: org_name, title (or job_title), location,
                     salary, description, posted_date. Can use either 'title' or
                     'job_title' for the job title field.

        Returns:
            SSEClassificationResult with rating, confidence, reasoning, and details.

        Raises:
            SSEClassificationError: On API errors or invalid response.
        """
        org_name = job_data.get("org_name") or job_data.get("organization", "Unknown")
        job_title = job_data.get("title") or job_data.get("job_title", "Unknown")
        location = job_data.get("location", "Unknown")
        salary = job_data.get("salary") or "Not specified"
        description = job_data.get("description", "") or ""
        posted_date = job_data.get("posted_date", datetime.utcnow().isoformat())

        # Blank/missing descriptions still classify: Tavily grounding supplies
        # employer context when there is no posting body. When a description
        # exists, score from that text and keep grounding off.
        has_description = bool(description.strip())

        prompt = get_sse_classification_prompt(
            org_name=org_name,
            job_title=job_title,
            location=location,
            salary=salary,
            job_description=description if has_description else "(no description provided)",
            posted_date=posted_date,
        )

        prompt_len = len(prompt)
        approx_tokens = max(1, prompt_len // 4)
        logger.debug("SSE prompt length: %d chars (≈%d tokens); description length: %d chars", prompt_len, approx_tokens, len(description))

        search_terms = f'"{org_name}"'
        if location and location != "Unknown":
            search_terms += f' "{location}"'
        # Keep search tight to the named employer — broad SSE keywords pull
        # unrelated co-ops/NGOs that models then confuse with the posting.
        search_query = f'{search_terms} official website mission governance'

        from llm.tavily_grounding import entity_require_terms

        require_terms = entity_require_terms(org_name) or None

        last_error_message = ""
        for attempt in range(2):
            try:
                response_text = self._call_provider_with_retry(
                    provider=self.provider,
                    prompt=prompt,
                    system=(
                        "You are an expert at analyzing job postings for Solidarity "
                        "Economy alignment. Score the role from the posting body. "
                        "Do not invent a different employer from search. Supporting "
                        "web evidence is only for missing employer context when the "
                        "posting has no description."
                    ),
                    task="sse",
                    search_query=None if has_description else search_query,
                    retries=0,  # The outer loop handles provider and parse retries
                    require_terms=None if has_description else require_terms,
                    use_grounding=not has_description,
                )
            except SSEClassificationError as e:
                last_error_message = str(e)
                logger.warning("SSE provider error (attempt %d/2): %s", attempt + 1, last_error_message)
                continue

            parsed_result, parse_error = self._safe_parse_sse_response(response_text, job_title, org_name)
            if parsed_result is not None:
                return parsed_result
            last_error_message = parse_error or "Unknown SSE parse error"
            logger.warning("SSE parse error (attempt %d/2): %s", attempt + 1, last_error_message)

        return self._default_failed_classification(reason=last_error_message)

    def classify_jobs_batch(self, jobs: list[dict]) -> list[SSEClassificationResult]:
        """Classify multiple jobs in a single API call to minimize quota usage.

        Much more efficient than calling classify_job() repeatedly.
        Processes jobs in one batch, returns results in same order.

        Args:
            jobs: List of job dicts with keys: org_name (or organization), title (or job_title),
                 location, salary, description, posted_date. Can use either naming convention.

        Returns:
            List of SSEClassificationResult in same order as input jobs.

        Raises:
            SSEClassificationError: On API errors or invalid response.
        """
        if not jobs:
            return []

        if len(jobs) > 25:
            # Split into batches of 25 to keep prompts manageable
            results = []
            for i in range(0, len(jobs), 25):
                batch_results = self.classify_jobs_batch(jobs[i:i + 25])
                results.extend(batch_results)
            return results

        # Normalize job data
        normalized_jobs = []
        for job in jobs:
            normalized_job = {
                "org_name": job.get("org_name") or job.get("organization", "Unknown"),
                "title": job.get("title") or job.get("job_title", "Unknown"),
                "location": job.get("location", "Unknown"),
                "salary": job.get("salary") or "Not specified",
                "description": job.get("description", ""),
                "posted_date": job.get("posted_date", datetime.utcnow().isoformat()),
            }
            if not normalized_job["description"].strip():
                raise SSEClassificationError("All job descriptions required for batch classification")
            normalized_jobs.append(normalized_job)

        prompt = get_sse_batch_classification_prompt(normalized_jobs)

        # Batch requires descriptions — mirror single-job policy: no Tavily /
        # Google Search grounding when posting bodies are present.
        response_text = self._call_provider_with_retry(
            provider=self.provider,
            prompt=prompt,
            system="You are an expert at analyzing job postings for Solidarity Economy alignment.",
            task="sse",
            search_query=None,
            retries=1,
            use_grounding=False,
        )

        org_names = [j["org_name"] for j in normalized_jobs]
        parse_result, parse_error = self._safe_parse_batch_response(
            response_text, len(jobs), org_names=org_names,
        )
        if parse_result is not None:
            return parse_result

        logger.warning("SSE batch parse error: %s", parse_error)
        logger.debug("Response (last 200 chars): %r", response_text[-200:])
        return [
            self._default_failed_classification(
                reason=parse_error or "Batch parse error",
            )
            for job in jobs
        ]

    # ---- Parsing helpers ----

    def _safe_parse_sse_response(self, response_text: str, job_title: str, org_name: str):
        """Return (result, error_message)."""
        try:
            return self._parse_sse_response(response_text, job_title, org_name), None
        except (json.JSONDecodeError, ValueError) as e:
            return None, str(e)

    def _parse_sse_response(self, response_text: str, job_title: str, org_name: str) -> SSEClassificationResult:
        """Parse and validate a single-job JSON response."""
        text = self._extract_json_block(response_text)

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

        result: SSEClassificationResult = {
            "rating": rating,
            "confidence": confidence,
            "reasoning": str(data.get("reasoning", "No reasoning provided")),
            "must_haves_met": [str(m) for m in must_haves],
            "nice_to_haves_met": [str(n) for n in nice_to_haves],
            "flags": [str(f) for f in flags],
            "classified_at": datetime.now(timezone.utc).isoformat(),
            "reviewed": False,
        }
        return _apply_nonprofit_compensation_guard(result, org_name=org_name)

    def _safe_parse_batch_response(
        self,
        response_text: str,
        num_jobs: int,
        org_names: list[str] | None = None,
    ):
        """Return (results, error_message)."""
        try:
            return self._parse_batch_sse_response(
                response_text, num_jobs, org_names=org_names,
            ), None
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            return None, str(e)

    def _parse_batch_sse_response(
        self,
        response_text: str,
        num_jobs: int,
        org_names: list[str] | None = None,
    ) -> list[SSEClassificationResult]:
        """Parse and validate a batch JSON array response."""
        text = self._extract_json_block(response_text)

        data_array = json.loads(text)

        if not isinstance(data_array, list):
            raise ValueError(f"Expected JSON array, got {type(data_array)}")

        if len(data_array) != num_jobs:
            raise ValueError(f"Expected {num_jobs} results, got {len(data_array)}")

        names = list(org_names or [])
        results = []
        for item in data_array:
            if not isinstance(item, dict):
                raise ValueError(f"Expected object in array, got {type(item)}")

            required = ["index", "rating", "confidence", "reasoning"]
            for field in required:
                if field not in item:
                    raise ValueError(f"Missing required field: {field}")

            rating = str(item.get("rating") or "").lower().strip()
            if rating not in ("strong_yes", "weak_yes", "no"):
                raise ValueError(f"Invalid rating: {rating} (must be strong_yes, weak_yes, or no)")

            must_haves = item.get("must_haves_met", [])
            if not isinstance(must_haves, list):
                must_haves = []

            nice_to_haves = item.get("nice_to_haves_met", [])
            if not isinstance(nice_to_haves, list):
                nice_to_haves = []

            flags = item.get("flags", [])
            if not isinstance(flags, list):
                flags = []

            confidence = max(0.0, min(1.0, float(item.get("confidence", 0.5))))

            parsed: SSEClassificationResult = {
                "rating": rating,
                "confidence": confidence,
                "reasoning": str(item.get("reasoning", "No reasoning provided")),
                "must_haves_met": [str(m) for m in must_haves],
                "nice_to_haves_met": [str(n) for n in nice_to_haves],
                "flags": [str(f) for f in flags],
                "classified_at": datetime.now(timezone.utc).isoformat(),
                "reviewed": False,
            }
            idx = item.get("index")
            org_hint = ""
            if isinstance(idx, int) and 0 <= idx < len(names):
                org_hint = names[idx]
            elif isinstance(idx, int) and 1 <= idx <= len(names):
                # Some models emit 1-based indexes
                org_hint = names[idx - 1]
            results.append(
                _apply_nonprofit_compensation_guard(parsed, org_name=org_hint)
            )

        return results
