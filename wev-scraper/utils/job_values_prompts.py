"""Prompt templates for tagging job postings with work values."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path


@dataclass
class WorkValue:
    label: str
    definition: str
    category: str
    signals: list[str]
    example: str
    negative_constraint: str | None = field(default=None)


@lru_cache(maxsize=1)
def get_taxonomy() -> list[WorkValue]:
    """Load the work values taxonomy lazily."""
    json_path = Path(__file__).resolve().parents[2] / "shared" / "taxonomy" / "work_values.json"
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [WorkValue(**item) for item in data]


@lru_cache(maxsize=1)
def get_work_values_set() -> frozenset[str]:
    """Get the set of all valid work value labels (cached, immutable)."""
    return frozenset(v.label for v in get_taxonomy())


@lru_cache(maxsize=1)
def _get_formatted_taxonomy() -> str:
    """Format the taxonomy string once."""
    return "\n\n".join(
        f"{v.label}: {v.definition}\nSignals: {', '.join(v.signals)}"
        for v in get_taxonomy()
    )


@lru_cache(maxsize=1)
def _get_negative_constraints() -> str:
    """Generate 'Do NOT' rules from taxonomy negative_constraint fields."""
    lines: list[str] = []
    for v in get_taxonomy():
        if v.negative_constraint:
            lines.append(f'- Do NOT use "{v.label}" unless {v.negative_constraint}.')
    return "\n".join(lines)


def format_job_chunks(
    jobs: list[dict],
    *,
    max_desc_chars: int = 2500,
    include_summary: bool = False,
    include_wage: bool = True,
) -> list[str]:
    """Format a list of jobs into numbered text blocks for LLM prompts."""
    chunks: list[str] = []
    for idx, job in enumerate(jobs, 1):
        description = (job.get("description") or "")[:max_desc_chars]
        parts = [
            f"JOB {idx}:",
            f"Organization: {job.get('organization', 'Unknown')}",
            f"Title: {job.get('job_title', 'Unknown')}",
            f"Location: {job.get('location', 'Unknown')}",
            f"Employment Type: {job.get('employment_type', 'Unknown')}",
        ]
        if include_wage:
            parts.append(f"Wage: {job.get('wage', 'Not specified')}")
        if include_summary:
            summary = (job.get("summary") or "")[:400]
            parts.append(f"Summary: {summary}")
        parts.append(f"Description:\n{description}")
        chunks.append("\n".join(parts))
    return chunks


# System instruction to anchor any provider to pure JSON output.
VALUES_SYSTEM_MSG = (
    "You output only valid JSON. Do not include any text, explanation, or markdown "
    "before or after the JSON array."
)

VALUES_BATCH_PROMPT_TEMPLATE = """You are tagging each job posting with work values.

Use ONLY labels from the allowed list below.
Choose 3 to {max_values} labels per job.
Do not infer values from the company name alone; use the title, summary, and description.

ALLOWED VALUES:
[label]: [definition]
Signals: [comma-separated signals — typical job-posting language]
{taxonomy}

JOBS (1-indexed):
{job_list}

OUTPUT FORMAT (JSON array only, same order as jobs):
[
  {{
    "index": 1,
    "values": ["Value A", "Value B"],
    "reasoning": "Short evidence-based rationale citing specific text."
  }}
]

Rules:
- Values must exactly match allowed labels (case-sensitive).
- No duplicate labels per job. Maximum {max_values} values per job — exceed this limit and your response is invalid.
- Aim for 4–5 values per job; only drop below 4 if genuine evidence is truly absent.
- Only include a label when there is clear, direct evidence in the description or title.
- Do NOT use "Experience" as a generic fallback — only include it when the role is explicitly framed as a broad learning or cross-functional exposure opportunity.
{negative_constraints}
- "Supervision" = managing or directing direct reports (team lead, manager, coordinator of staff). "Influence People" = persuading, coaching, or shaping behaviour of stakeholders, clients, or communities beyond direct reports. Use both where evidence supports it.
- Return ONLY the JSON array. No text before or after it.
- Every label in the "values" array MUST be in the ALLOWED VALUES list above. Labels not in that list (e.g. 'Strategic', 'Impact', 'Innovation') are INVALID and must not appear.
"""


def get_values_batch_prompt(jobs: list[dict], max_values: int = 5) -> str:
    """Format the batch prompt for value tagging."""
    return VALUES_BATCH_PROMPT_TEMPLATE.format(
        max_values=max_values,
        taxonomy=_get_formatted_taxonomy(),
        negative_constraints=_get_negative_constraints(),
        job_list="\n\n".join(format_job_chunks(jobs, include_summary=True)),
    )
