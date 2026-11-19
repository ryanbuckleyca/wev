"""Prompt templates and shared loader for the SSE sector taxonomy (v2.5)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

_SECTOR_JSON = (
    Path(__file__).resolve().parents[2] / "shared" / "taxonomy" / "sectors.json"
)


@dataclass(frozen=True)
class Sector:
    id: str
    category_id: str
    kind: str
    label_en: str
    label_fr: str
    definition_en: str
    definition_fr: str
    scope_note_en: str
    inclusions: list[str]
    exclusions: list[str]
    signals_en: list[str]
    signals_fr: list[str]
    example_en: str
    example_fr: str
    boundary_note_en: str
    boundary_note_fr: str
    aliases: list[str]
    term_crosswalk: dict[str, str]
    skos: dict[str, Any] = field(default_factory=dict)
    usage: str | None = None


def _entry_from_dict(item: dict[str, Any]) -> Sector:
    return Sector(
        id=item["id"],
        category_id=item.get("category_id") or item["id"],
        kind=item.get("kind") or "sector",
        label_en=item.get("label_en") or item.get("label") or item["id"],
        label_fr=item.get("label_fr") or item.get("label_en") or item["id"],
        definition_en=item.get("definition_en") or "",
        definition_fr=item.get("definition_fr") or item.get("definition_en") or "",
        scope_note_en=item.get("scope_note_en") or "",
        inclusions=list(item.get("inclusions") or []),
        exclusions=list(item.get("exclusions") or []),
        signals_en=list(item.get("signals_en") or []),
        signals_fr=list(item.get("signals_fr") or []),
        example_en=item.get("example_en") or "",
        example_fr=item.get("example_fr") or "",
        boundary_note_en=item.get("boundary_note_en") or "",
        boundary_note_fr=item.get("boundary_note_fr") or "",
        aliases=list(item.get("aliases") or []),
        term_crosswalk=dict(item.get("term_crosswalk") or {}),
        skos=dict(item.get("skos") or {}),
        usage=item.get("usage"),
    )


@lru_cache(maxsize=1)
def get_sector_taxonomy_document() -> dict[str, Any]:
    """Load the full shared taxonomy document (metadata + sectors + facets)."""
    with open(_SECTOR_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or not isinstance(data.get("sectors"), list):
        raise ValueError(f"Invalid sector taxonomy document at {_SECTOR_JSON}")
    return data


@lru_cache(maxsize=1)
def get_crosswalk_source_ids() -> tuple[str, ...]:
    """Ordered crosswalk source keys from the MASTER workbook."""
    doc = get_sector_taxonomy_document()
    sources = doc.get("crosswalk_sources") or {}
    return tuple(sources.keys())


@lru_cache(maxsize=1)
def get_sector_taxonomy() -> list[Sector]:
    """Industry sectors only (excludes role/population/employer facets)."""
    data = get_sector_taxonomy_document()
    return [_entry_from_dict(item) for item in data["sectors"]]


@lru_cache(maxsize=1)
def get_sector_facets() -> list[Sector]:
    """Non-sector facets (role / population-cause / employer-type)."""
    data = get_sector_taxonomy_document()
    return [_entry_from_dict(item) for item in data.get("facets") or []]


@lru_cache(maxsize=1)
def get_sector_ids_set() -> frozenset[str]:
    """Valid industry sector IDs (not facets)."""
    return frozenset(s.id for s in get_sector_taxonomy())


@lru_cache(maxsize=1)
def get_legacy_sector_id_map() -> dict[str, str]:
    """Map retired v1 sector IDs → v2.5 IDs."""
    doc = get_sector_taxonomy_document()
    raw = doc.get("legacy_id_map") or {}
    return {str(k): str(v) for k, v in raw.items()}


def canonicalize_sector_id(sector_id: str | None) -> str | None:
    """Normalize a sector id, remapping legacy v1 IDs when present."""
    if not sector_id:
        return None
    mapped = get_legacy_sector_id_map().get(sector_id, sector_id)
    return mapped if mapped in get_sector_ids_set() else None


@lru_cache(maxsize=1)
def get_formatted_sector_taxonomy() -> str:
    """Format sectors + decision rules for LLM prompts."""
    from utils.sector_crosswalk import format_crosswalk_aliases_for_sector

    lines: list[str] = []
    lines.append(
        "Use ONLY industry sector IDs below. Do NOT assign facet IDs "
        "(role/function, population/cause/geography, employer type) as sector_id — "
        "those are orthogonal tags, not sectors."
    )
    lines.append("")
    for s in get_sector_taxonomy():
        lines.append(f"[{s.id}] {s.label_en} ({s.category_id})")
        if s.definition_en:
            lines.append(f"Definition: {s.definition_en}")
        if s.scope_note_en:
            lines.append(f"Scope: {s.scope_note_en}")
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

    rules = get_sector_taxonomy_document().get("decision_rules") or []
    if rules:
        lines.append("DECISION RULES (edge cases):")
        for rule in rules:
            lines.append(
                f"- {rule.get('id')}: {rule.get('target')} — {rule.get('rule')}"
            )
        lines.append("")

    facets = get_sector_facets()
    if facets:
        lines.append(
            "NON-SECTOR FACETS (do not use as sector_id; map scraped tags here instead):"
        )
        for f in facets:
            lines.append(f"- [{f.id}] {f.label_en}: {f.definition_en}")
        lines.append("")

    return "\n".join(lines).strip()


SECTOR_BATCH_PROMPT_TEMPLATE = """You are evaluating organizations to determine their correct sector.

Use ONLY industry sector IDs from the allowed list below. Select the single best fit for each organization.
If none of the sectors fit well, return null.
Never return a facet ID (role/function, population/cause, employer type) as sector_id.

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
