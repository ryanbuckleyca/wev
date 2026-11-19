"""Prompt templates and shared loader for the SSE sector taxonomy."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

CROSSWALK_SOURCE_IDS: tuple[str, ...] = (
    "cmc",
    "chantier",
    "ccednet_buy_social",
    "ripess",
)

_SECTOR_JSON = (
    Path(__file__).resolve().parents[2] / "shared" / "taxonomy" / "sectors.json"
)


@dataclass(frozen=True)
class Sector:
    id: str
    label_en: str
    label_fr: str
    definition_en: str
    definition_fr: str
    signals_en: list[str]
    signals_fr: list[str]
    example_en: str
    example_fr: str
    boundary_note_en: str
    boundary_note_fr: str
    term_crosswalk: dict[str, str]


@lru_cache(maxsize=1)
def get_sector_taxonomy_document() -> dict[str, Any]:
    """Load the full shared taxonomy document (metadata + sectors)."""
    with open(_SECTOR_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or not isinstance(data.get("sectors"), list):
        raise ValueError(f"Invalid sector taxonomy document at {_SECTOR_JSON}")
    return data


@lru_cache(maxsize=1)
def get_sector_taxonomy() -> list[Sector]:
    """Load the sector taxonomy lazily."""
    data = get_sector_taxonomy_document()
    sectors: list[Sector] = []
    for item in data["sectors"]:
        if not isinstance(item, dict):
            raise ValueError("sector taxonomy entries must be objects")
        sectors.append(
            Sector(
                id=item["id"],
                label_en=item.get("label_en") or item.get("label") or item["id"],
                label_fr=item.get("label_fr") or item.get("label_en") or item["id"],
                definition_en=item.get("definition_en") or "",
                definition_fr=item.get("definition_fr") or "",
                signals_en=list(item.get("signals_en") or []),
                signals_fr=list(item.get("signals_fr") or []),
                example_en=item.get("example_en") or "",
                example_fr=item.get("example_fr") or "",
                boundary_note_en=item.get("boundary_note_en") or "",
                boundary_note_fr=item.get("boundary_note_fr") or "",
                term_crosswalk=dict(item.get("term_crosswalk") or {}),
            )
        )
    return sectors


@lru_cache(maxsize=1)
def get_sector_ids_set() -> frozenset[str]:
    """Get the set of all valid sector IDs."""
    return frozenset(s.id for s in get_sector_taxonomy())


@lru_cache(maxsize=1)
def get_formatted_sector_taxonomy() -> str:
    """Format the taxonomy string once for LLM prompts.

    Includes definitions and MASTER-sheet source aliases so models (and later
    scraped source categories) share the same vocabulary surface.
    """
    # Local import avoids a circular dependency at module load.
    from utils.sector_crosswalk import format_crosswalk_aliases_for_sector

    lines: list[str] = []
    for s in get_sector_taxonomy():
        lines.append(f"[{s.id}] {s.label_en}")
        if s.definition_en:
            lines.append(f"Definition: {s.definition_en}")
        if s.signals_en:
            lines.append(f"Signals: {', '.join(s.signals_en)}")
        if s.example_en:
            lines.append(s.example_en)
        if s.boundary_note_en:
            lines.append(f"Boundary Note: {s.boundary_note_en}")
        aliases = format_crosswalk_aliases_for_sector(s)
        if aliases:
            lines.append(f"Source aliases: {aliases}")
        lines.append("")
    return "\n".join(lines).strip()


SECTOR_BATCH_PROMPT_TEMPLATE = """You are evaluating organizations to determine their correct sector.

Use ONLY IDs from the allowed list below. Select the single best fit for each organization.
If none of the sectors fit well, return null.

When a SOURCE CATEGORY / directory label is provided and it matches a listed
Source alias for a sector, prefer that sector unless the org evidence clearly
contradicts it.

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
        source_cat = org.get("source_category") or org.get("source_categories")
        if source_cat:
            parts.insert(-1, f"Source category: {source_cat}")
        chunks.append("\n".join(parts))
    return "\n\n".join(chunks)
