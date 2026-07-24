"""Prompt templates for tagging organizations with sectors."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass
class Sector:
    id: str
    signals_en: list[str]
    signals_fr: list[str]
    example_en: str
    example_fr: str
    boundary_note_en: str
    boundary_note_fr: str
    term_crosswalk: dict[str, str]


@lru_cache(maxsize=1)
def get_sector_taxonomy() -> list[Sector]:
    """Load the sector taxonomy lazily."""
    json_path = Path(__file__).resolve().parents[2] / "shared" / "taxonomy" / "sectors.json"
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [Sector(**item) for item in data["sectors"]]


@lru_cache(maxsize=1)
def get_sector_ids_set() -> frozenset[str]:
    """Get the set of all valid sector IDs."""
    return frozenset(s.id for s in get_sector_taxonomy())


@lru_cache(maxsize=1)
def get_formatted_sector_taxonomy() -> str:
    """Format the taxonomy string once for LLM prompts."""
    lines = []
    for s in get_sector_taxonomy():
        lines.append(f"[{s.id}]")
        lines.append(f"Signals: {', '.join(s.signals_en)}")
        lines.append(s.example_en)
        if s.boundary_note_en:
            lines.append(f"Boundary Note: {s.boundary_note_en}")
        lines.append("")
    return "\n".join(lines).strip()


SECTOR_BATCH_PROMPT_TEMPLATE = """You are evaluating organizations to determine their correct sector.

Use ONLY IDs from the allowed list below. Select the single best fit for each organization.
If none of the sectors fit well, return null.

ALLOWED SECTORS:
{taxonomy}

ORGANIZATIONS (1-indexed):
{organizations_text}

Return a JSON object matching this schema:
{{
  "results": [
    {{
      "org_id": "original organization ID provided (integer)",
      "sector_id": "sector ID from the ALLOWED SECTORS list, or null"
    }}
  ]
}}

You output only valid JSON. Do not include any text, explanation, or markdown before or after the JSON.
"""

def format_org_chunks(orgs: list[dict], max_desc_chars: int = 1500) -> str:
    """Format a list of orgs into numbered text blocks for LLM batch prompts."""
    chunks: list[str] = []
    for idx, org in enumerate(orgs, 1):
        desc = (org.get("description") or "")[:max_desc_chars]
        mission = (org.get("mission_statement") or "")[:max_desc_chars]
        parts = [
            f"ORG {idx} (ID: {org['id']}):",
            f"Name: {org.get('name', 'Unknown')}",
            f"Website: {org.get('website', 'Unknown')}",
            f"Mission: {mission}",
            f"Description:\n{desc}",
        ]
        chunks.append("\n".join(parts))
    return "\n\n".join(chunks)
