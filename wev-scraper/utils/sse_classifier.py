"""SSE (Solidarity Economy) job classifier using Gemini API."""

import json
import logging
from datetime import datetime, timezone
from typing import TypedDict

from llm.factory import get_sse_provider
from utils.base_grounded_classifier import BaseGroundedClassifier, SSEClassificationError
from utils.sse_prompts import (
    SSE_SEARCH_KEYWORDS,
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
        description = job_data.get("description", "")
        posted_date = job_data.get("posted_date", datetime.utcnow().isoformat())

        if not description or not description.strip():
            raise SSEClassificationError("Job description is required for classification")

        prompt = get_sse_classification_prompt(
            org_name=org_name,
            job_title=job_title,
            location=location,
            salary=salary,
            job_description=description,
            posted_date=posted_date,
        )

        prompt_len = len(prompt)
        approx_tokens = max(1, prompt_len // 4)
        logger.debug(f"SSE prompt length: {prompt_len} chars (≈{approx_tokens} tokens); description length: {len(description)} chars")

        search_terms = f'"{org_name}"'
        if location and location != "Unknown":
            search_terms += f' "{location}"'
        search_query = f'{search_terms} {SSE_SEARCH_KEYWORDS}'

        last_error_message = ""
        for attempt in range(2):
            response_text = self._call_provider_with_retry(
                provider=self.provider,
                prompt=prompt,
                system="You are an expert at analyzing job postings for Solidarity Economy alignment.",
                task="sse",
                search_query=search_query,
                retries=0, # The outer loop handles the parsing retries
            )

            parsed_result, parse_error = self._safe_parse_sse_response(response_text, job_title, org_name)
            if parsed_result is not None:
                return parsed_result
            last_error_message = parse_error or "Unknown SSE parse error"
            logger.warning(f"SSE parse error (attempt {attempt + 1}/2): {last_error_message}")

        return self._default_failed_classification(job_title, org_name, last_error_message)

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

        org_search_terms = []
        for j in normalized_jobs:
            if j["org_name"] and j["org_name"] != "Unknown":
                term = f'"{j["org_name"]}"'
                if j.get("location") and j["location"] != "Unknown":
                    term += f' "{j["location"]}"'
                org_search_terms.append(term)

        search_query = " OR ".join(org_search_terms) + f" {SSE_SEARCH_KEYWORDS}" if org_search_terms else None

        response_text = self._call_provider_with_retry(
            provider=self.provider,
            prompt=prompt,
            system="You are an expert at analyzing job postings for Solidarity Economy alignment.",
            task="sse",
            search_query=search_query,
            retries=1,
        )

        parse_result, parse_error = self._safe_parse_batch_response(response_text, len(jobs))
        if parse_result is not None:
            return parse_result

        logger.warning(f"SSE batch parse error: {parse_error}")
        logger.debug(f"Response (last 200 chars): {repr(response_text[-200:])}")
        return [
            self._default_failed_classification(
                job.get("job_title", "Unknown"),
                job.get("organization", "Unknown"),
                parse_error or "Batch parse error",
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

    def _safe_parse_batch_response(self, response_text: str, num_jobs: int):
        """Return (results, error_message)."""
        try:
            return self._parse_batch_sse_response(response_text, num_jobs), None
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            return None, str(e)

    def _parse_batch_sse_response(self, response_text: str, num_jobs: int) -> list[SSEClassificationResult]:
        """Parse and validate a batch JSON array response."""
        text = self._extract_json_block(response_text)

        data_array = json.loads(text)

        if not isinstance(data_array, list):
            raise ValueError(f"Expected JSON array, got {type(data_array)}")

        if len(data_array) != num_jobs:
            raise ValueError(f"Expected {num_jobs} results, got {len(data_array)}")

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

            results.append({
                "rating": rating,
                "confidence": confidence,
                "reasoning": str(item.get("reasoning", "No reasoning provided")),
                "must_haves_met": [str(m) for m in must_haves],
                "nice_to_haves_met": [str(n) for n in nice_to_haves],
                "flags": [str(f) for f in flags],
                "classified_at": datetime.now(timezone.utc).isoformat(),
                "reviewed": False,
            })

        return results

