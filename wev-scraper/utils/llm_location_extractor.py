"""LLM-based location extraction for job postings.

Uses the shared fallback chain
(gemini-3.6-flash → gemini-3.5-flash-lite → groq → cerebras → ollama),
same as OrganizationAssessor and the unified post-processor. Handles edge cases
like accented characters, French text, remote/hybrid locations, and regional
descriptors that traditional regex patterns struggle with.

Usage:
    from utils.llm_location_extractor import extract_locations_for_jobs

    jobs = [
        {"location": "Remote in Ontario"},
        {"location": "Bureau situé à Lévis, Quebec"},
        {"location": "Port Rowan, ON (Norfolk County)"},
    ]

    extract_locations_for_jobs(jobs)  # Modifies jobs in-place

    # jobs now have municipality, province, work_type fields populated
"""

import json
import logging
import time
from typing import Any, Dict, List

from llm.factory import get_fallback_llm_provider

logger = logging.getLogger(__name__)

_DEFAULT_OFFICE = {
    "municipality": None,
    "province": None,
    "work_type": "office",
}


def extract_locations_for_jobs(
    jobs: List[Dict[str, Any]],
    batch_size: int = 15,
    rate_limit_seconds: float = 7.0
) -> None:
    """Extract structured location data for a list of jobs using LLM.

    Modifies jobs in-place, adding/updating:
    - municipality: str | None
    - province: str | None
    - work_type: str ("remote" | "hybrid" | "office")
    - is_remote: bool (deprecated, for backward compatibility)

    Args:
        jobs: List of job dicts, each with a 'location' field
        batch_size: Number of locations to process in a single LLM call
        rate_limit_seconds: Seconds to wait between batches (Gemini free tier ~10 RPM)
    """
    if not jobs:
        return

    # Process in batches
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i:i + batch_size]

        # Extract locations
        location_strings = [job.get("location", "") for job in batch]

        # Get structured data from LLM
        results = _extract_batch(location_strings)

        # Update jobs with results
        for job, result in zip(batch, results, strict=False):
            job["municipality"] = result.get("municipality")
            job["province"] = result.get("province")
            work_type = result.get("work_type", "office")
            job["work_type"] = work_type
            # Keep is_remote for backward compatibility
            job["is_remote"] = (work_type == "remote")

        # Rate limiting between batches
        if i + batch_size < len(jobs):
            time.sleep(rate_limit_seconds)


def _default_results(n: int) -> List[Dict[str, Any]]:
    return [dict(_DEFAULT_OFFICE) for _ in range(n)]


def _normalize_location_result(item: Any) -> Dict[str, Any]:
    """Coerce null / non-dict LLM entries to the default office result.

    Flash-Lite (and others) sometimes return ``[null, {...}]``; treating null
    as a default avoids ``NoneType.get`` after a successful fallback.
    """
    if not isinstance(item, dict):
        return dict(_DEFAULT_OFFICE)
    return {
        "municipality": item.get("municipality"),
        "province": item.get("province"),
        "work_type": item.get("work_type") or "office",
    }


def _extract_batch(locations: List[str]) -> List[Dict[str, Any]]:
    """Extract structured location data for a batch of location strings.

    Args:
        locations: List of raw location strings

    Returns:
        List of dicts with keys: municipality, province, work_type
    """
    if not locations:
        return []

    prompt = """For each location string, return:
- municipality: The city/town name (or null if remote/not found)
- province: Canadian province/territory 2-letter code (REQUIRED - must infer from city name if not explicit)
- work_type: "remote" (fully remote), "hybrid" (mix of remote and office), or "office" (on-site)

CRITICAL RULES:
1. ALWAYS infer province code from well-known Canadian cities:
   - Montreal/Montréal - QC
   - Quebec/Québec - QC
   - Gatineau - QC
   - Ottawa - ON
   - Toronto - ON
   - Vancouver - BC
   - Calgary - AB
   - Even if province is not explicitly stated, you MUST infer it

2. WORK TYPE DETECTION:
   - "anywhere in Canada" / "Virtual and/or in person, anywhere" - work_type="remote", municipality=null, province=null
   - "Remote" with NO specific location - work_type="remote", municipality=null, province=null
   - "Option to work onsite... or remote" - work_type="remote", municipality=null, province=null (office is optional)
   - "Remote at your home office" - work_type="remote" (even if office location mentioned as optional)
   - "Work from home" / "WFH" - work_type="remote"
   - "Remote in [Region]" - work_type="remote", municipality=[Region], province=inferred
   - "Hybrid" (mix of remote and office) - work_type="hybrid", extract office location
   - Office REQUIRED (no remote option) - work_type="office", extract office location

3. ACCURACY:
   - DO NOT hallucinate cities not mentioned in the input
   - "Gatineau, QC" stays "Gatineau, QC" (not Montréal!)
   - Extract EXACTLY what is written, then infer province

4. Regional descriptors (non-remote):
   - "Peel Region" - "Peel"
   - "GTA" - "Toronto"

5. French/accents: Support "Montréal", "Québec", "Lévis", etc.

- "Montreal (5151 de l'Assomption Boulevard)" - {{"municipality": "Montreal", "province": "QC", "work_type": "office"}}
- "Pt.St.Charles, Montreal" - {{"municipality": "Pt.St.Charles", "province": "QC", "work_type": "office"}}
- "Côte des Neiges (Montréal)" - {{"municipality": "Côte des Neiges", "province": "QC", "work_type": "office"}}
- "Ville Mont Royal" - {{"municipality": "Ville Mont Royal", "province": "QC", "work_type": "office"}}
- "Vancouver" - {{"municipality": "Vancouver", "province": "BC", "work_type": "office"}}

Input location strings (as JSON array):
{locations_json}

Return ONLY a valid JSON array with one object per input location, in the same order. No markdown, no explanation.
Format: [{{"municipality": "...", "province": "...", "work_type": "remote|hybrid|office"}}, ...]
"""

    locations_json = json.dumps(locations, ensure_ascii=False)
    full_prompt = prompt.format(locations_json=locations_json)

    try:
        # Same chain as OrganizationAssessor / unified processor:
        # gemini-3.6-flash → gemini-3.5-flash-lite → groq → cerebras → ollama.
        # json_mode=False because we need a top-level JSON array, not an object.
        # Groq's json_object mode only supports a single root object, which causes
        # the model to collapse all results into one entry.
        provider = get_fallback_llm_provider()
        if not provider:
            raise RuntimeError(
                "No LLM provider available for location extraction "
                "(check GEMINI_API_KEY / GROQ_API_KEY)"
            )

        response = provider.complete(full_prompt, json_mode=False)

        if not response:
            raise Exception("LLM returned empty response for location extraction")

        text = response.strip()
        if text.startswith("```"):
            # Remove ```json and ``` markers
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if len(lines) > 2 else text

        results = json.loads(text)

        # Normalise: LLM sometimes returns a single object instead of a 1-element array
        if isinstance(results, dict):
            results = [results]

        if not isinstance(results, list):
            raise Exception(
                f"Expected JSON array from location extraction, got {type(results).__name__}"
            )

        # Validate we got the right number of results
        if len(results) != len(locations):
            print(f"Warning: Expected {len(locations)} results, got {len(results)}")
            print(f"Input locations ({len(locations)}): {locations[:3]}... (showing first 3)")
            print(f"LLM returned {len(results)} results")
            # Pad with default values if needed
            while len(results) < len(locations):
                missing_index = len(results)
                print(f"  → Padding missing result at index {missing_index}: '{locations[missing_index] if missing_index < len(locations) else 'unknown'}'")
                results.append(dict(_DEFAULT_OFFICE))

        # Null / non-dict entries (common from lite) → default office result
        return [_normalize_location_result(item) for item in results[: len(locations)]]

    except Exception as e:
        logger.warning("Error extracting locations with LLM: %s", e)
        print(f"Error extracting locations with LLM: {e}")
        return _default_results(len(locations))


def extract_location_single(location: str) -> Dict[str, Any]:
    """Extract structured location data for a single location string.

    Convenience wrapper for single location extraction.

    Args:
        location: Raw location string

    Returns:
        Dict with keys: municipality, province, work_type
    """
    results = _extract_batch([location])
    return results[0] if results else {
        "municipality": None,
        "province": None,
        "work_type": "office"
    }
