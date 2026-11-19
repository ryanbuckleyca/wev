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


@lru_cache(maxsize=1)
def get_category_id_map() -> dict[str, str]:
    """Map MASTER category IDs (SSE_SEC_01 …) → industry sector slug IDs."""
    return {s.category_id: s.id for s in get_sector_taxonomy()}


def canonicalize_sector_id(sector_id: str | None) -> str | None:
    """Normalize a sector id, remapping legacy v1 and MASTER category IDs.

    Accepts slug IDs (`housing-collective-real-estate`), retired v1 slugs, and
    MASTER codes (`SSE_SEC_04`). Facet codes (`SSE_FAC_*`) and unknown values
    return None.
    """
    if not sector_id:
        return None
    raw = str(sector_id).strip()
    if not raw:
        return None
    mapped = get_legacy_sector_id_map().get(raw, raw)
    mapped = get_category_id_map().get(mapped, mapped)
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
        # Lead with the slug ID the DB expects; category codes are reference only.
        lines.append(f"ID `{s.id}` — {s.label_en} (MASTER {s.category_id})")
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

Use ONLY the slug IDs shown as ID `...` in the allowed list (e.g. "housing-collective-real-estate").
Do NOT return MASTER codes like SSE_SEC_01, labels, or facet IDs as sector_id.
Select the single best fit for each organization. If none fit well, return null.

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
      "sector_id": "slug ID from the ALLOWED SECTORS list (not SSE_SEC_*), or null"
    }}
  ]
}}

You output only valid JSON. Do not include any text, explanation, or markdown before or after the JSON.
"""


def _nonblank_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    if isinstance(value, (list, tuple)):
        text = ", ".join(str(item).strip() for item in value if str(item).strip())
        return text or None
    return None


def _source_categories_candidates(org: dict) -> list[Any]:
    """Prefer source_category, then org.source_categories, then extra payload."""
    extra = org.get("extra")
    extra_payload = (
        extra.get("source_categories") if isinstance(extra, dict) else None
    )
    return [
        org.get("source_category"),
        org.get("source_categories"),
        extra_payload,
    ]


def _source_category_prompt_lines(org: dict) -> list[str]:
    """Preference hint from verified matches; unresolved raw labels as context only."""
    for candidate in _source_categories_candidates(org):
        if isinstance(candidate, dict):
            verified: list[str] = []
            for key in ("resolved_sector_ids", "facet_ids"):
                values = candidate.get(key)
                if isinstance(values, list):
                    verified.extend(str(v).strip() for v in values if str(v).strip())
            raw_values = candidate.get("raw")
            unresolved = candidate.get("unresolved_terms")
            context_parts: list[str] = []
            if isinstance(unresolved, list):
                context_parts.extend(
                    str(item).strip() for item in unresolved if str(item).strip()
                )
            elif isinstance(raw_values, list) and not verified:
                # Unstructured raw list with no verified ids — context only.
                context_parts.extend(
                    str(item).strip() for item in raw_values if str(item).strip()
                )
            elif isinstance(raw_values, list):
                verified_set = {v.lower() for v in verified}
                context_parts.extend(
                    str(item).strip()
                    for item in raw_values
                    if str(item).strip() and str(item).strip().lower() not in verified_set
                )

            lines: list[str] = []
            if verified:
                lines.append(
                    "Source category preference (verified): " + ", ".join(verified)
                )
            if context_parts:
                lines.append(
                    "Source category context (unresolved): " + ", ".join(context_parts)
                )
            if lines:
                return lines
            continue

        text = _nonblank_text(candidate)
        if text:
            # Plain string/list evidence — treat as context, not a verified preference.
            return [f"Source category context: {text}"]
    return []


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
        for line in _source_category_prompt_lines(org):
            parts.insert(-1, line)
        chunks.append("\n".join(parts))
    return "\n\n".join(chunks)
