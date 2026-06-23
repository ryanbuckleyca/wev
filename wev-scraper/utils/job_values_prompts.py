"""Prompt templates for tagging job postings with work values."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass
class WorkValue:
    label: str
    definition: str
    example: str
    signals: list[str]

@lru_cache(maxsize=1)
def get_taxonomy() -> list[WorkValue]:
    """Load the work values taxonomy lazily."""
    json_path = Path(__file__).resolve().parents[2] / "shared" / "taxonomy" / "work_values.json"
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [WorkValue(**item) for item in data]

def get_work_values_set() -> set[str]:
    """Get the set of all valid work value labels."""
    return {v.label for v in get_taxonomy()}

@lru_cache(maxsize=1)
def _get_formatted_taxonomy() -> str:
    """Format the taxonomy string once."""
    return "\n\n".join(
        f"{v.label}: {v.definition}\nSignals: {', '.join(v.signals)}"
        for v in get_taxonomy()
    )


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
- Do NOT use "Aesthetic" unless the role explicitly involves beauty, design, visual form, or artistic output (e.g. graphic design, UX, photography).
- Do NOT use "Location" unless geography or work setting is a prominent, stated feature of the role (e.g. field work, required relocation, unique site).
- Do NOT use "Advancement" unless the posting explicitly mentions career growth, promotion paths, or progression opportunities.
- Do NOT use "Community" as a default for any role that involves working with people. Only include it when the posting explicitly frames community connection, belonging, or local impact as a core feature of the work.
- Do NOT use "Moral Fulfillment" unless the posting explicitly uses language about ethics, integrity, or values alignment as a draw.
- "Supervision" = managing or directing direct reports (team lead, manager, coordinator of staff). "Influence People" = persuading, coaching, or shaping behaviour of stakeholders, clients, or communities beyond direct reports. Use both where evidence supports it.
- Do NOT use "Diversity" unless the posting explicitly mentions diverse backgrounds, inclusion, or equity as a feature of the team or organisation.
- Do NOT use "Environment" unless the role explicitly involves sustainability, conservation, or reducing environmental impact.
- Do NOT use "Family" unless the posting explicitly mentions flexible hours, family-friendly scheduling, or work-life accommodation.
- Do NOT use "Fun and Humor" unless the posting explicitly describes a playful, light-hearted, or humorous team culture.
- Do NOT use "Honesty and Integrity" unless the posting explicitly names ethics, transparency, or integrity as organisational values.
- Do NOT use "Independence" unless the posting explicitly describes autonomous work, self-direction, or minimal supervision.
- Do NOT use "Personal Safety" unless the role explicitly involves safety protocols, physical risk management, or health and safety as a feature.
- Do NOT use "Power and Authority" unless the role explicitly grants control over others' work, budgets, or strategic direction.
- Do NOT use "Spirituality" unless the posting explicitly references spiritual practice, faith-based mission, or religious community.
- Do NOT use "Steep Learning Curve" unless the posting explicitly frames rapid skill acquisition or mastery of new domains as a core feature.
- Do NOT use "Structure and Predictability" unless the posting explicitly describes well-defined processes, clear expectations, or stable routines.
- Do NOT use "Tradition" unless the posting explicitly references heritage, established customs, or long-standing organisational practices.
- Do NOT use "Work-Life Balance" unless the posting explicitly mentions balance, reasonable hours, or respect for personal time.
- Do NOT use "Adventure" unless the role explicitly involves physical risk, bold decisions, or unconventional environments.
- Do NOT use "Group & Team" as a default for any collaborative role — only use it when team-based outcomes and shared accountability are explicitly emphasised over individual contribution.
- Return ONLY the JSON array. No text before or after it.
- Every label in the "values" array MUST be in the ALLOWED VALUES list above. Labels not in that list (e.g. 'Strategic', 'Impact', 'Innovation') are INVALID and must not appear.
"""


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
        taxonomy=_get_formatted_taxonomy(),
        job_list="\n\n".join(job_chunks),
    )

