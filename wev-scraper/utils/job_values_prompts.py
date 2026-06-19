"""Prompt templates for tagging job postings with work values."""

from __future__ import annotations

from typing import Final

import json
import os
from dataclasses import dataclass

@dataclass
class WorkValue:
    label: str
    definition: str
    example: str
    signals: list[str]

def _load_taxonomy() -> list[WorkValue]:
    # Path is relative to the scraper root (wev/wev-scraper) -> wev/shared/taxonomy
    json_path = os.path.join(os.path.dirname(__file__), "..", "..", "shared", "taxonomy", "work_values.json")
    with open(json_path, "r") as f:
        data = json.load(f)
    return [WorkValue(**item) for item in data]

WORK_VALUES_TAXONOMY: Final[list[WorkValue]] = _load_taxonomy()
WORK_VALUES_SET: Final[set[str]] = {v.label for v in WORK_VALUES_TAXONOMY}


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
- Do NOT use "Competence" as a default — only include it when mastery or high-craft execution is explicitly emphasised.
- Do NOT use "Challenge" unless the posting contains at least one of these exact words verbatim: 'challenging', 'challenge', 'complex', 'demanding', 'difficult'. If none of those words appear, do not assign Challenge under any circumstances, even if the work sounds hard.
- Do NOT use "Community" as a default for any role that involves working with people. Only include it when the posting explicitly frames community connection, belonging, or local impact as a core feature of the work.
- "Supervision" = managing or directing direct reports (team lead, manager, coordinator of staff). "Influence People" = persuading, coaching, or shaping behaviour of stakeholders, clients, or communities beyond direct reports. Use both where evidence supports it.
- Do NOT use "Group & Team" as a default for any collaborative role — only use it when team-based outcomes and shared accountability are explicitly emphasised over individual contribution.
- Return ONLY the JSON array. No text before or after it.
- Every label in the "values" array MUST be in the ALLOWED VALUES list above. Labels not in that list (e.g. 'Strategic', 'Impact', 'Innovation') are INVALID and must not appear.
"""


def _format_taxonomy() -> str:
    return "\n\n".join(
        f"{v.label}: {v.definition}\nSignals: {', '.join(v.signals)}"
        for v in WORK_VALUES_TAXONOMY
    )


def get_values_batch_prompt(jobs: list[dict], max_values: int = 5) -> str:
    """Format the batch prompt for value tagging."""
    job_chunks: list[str] = []
    for idx, job in enumerate(jobs, 1):
        description = (job.get("description") or "")[:2500]
        summary = (job.get("summary") or "")[:400]
        job_chunks.append(
            (
                f"JOB {idx}:\n"
                f"Organization: {job.get('organization', 'Unknown')}\n"
                f"Title: {job.get('job_title', 'Unknown')}\n"
                f"Location: {job.get('location', 'Unknown')}\n"
                f"Employment Type: {job.get('employment_type', 'Unknown')}\n"
                f"Wage: {job.get('wage', 'Not specified')}\n"
                f"Summary: {summary}\n"
                f"Description:\n{description}"
            )
        )

    return VALUES_BATCH_PROMPT_TEMPLATE.format(
        max_values=max_values,
        taxonomy=_format_taxonomy(),
        job_list="\n\n".join(job_chunks),
    )

