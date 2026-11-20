"""Canadian SSE governance taxonomy (single-axis, 2-level).

Source of truth for the 5 parent categories and 14 governance subtypes (plus
the EXCLUDED / EXCLUDED_NON_SSE special category) used to classify the
governance *form* of an organization — WHO holds ownership and democratic
voting control — independent of sector, business model, or delivery platform.

This module is mirrored by:
  - the SQL CHECK constraints in the org governance migration, and
  - the TypeScript union + i18n labels in wev-bulletin.
Keep those in sync with ``GOVERNANCE_TAXONOMY_VERSION`` when codes change.

Classification is governance-first: operational delivery modes (platform
co-ops, gig apps, B2B procurement portals) are NOT governance types; they are
recorded as free-text ``operational_tags``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_TAXONOMY_PATH = Path(__file__).resolve().parents[2] / "shared" / "taxonomy" / "governance.json"

with open(_TAXONOMY_PATH, encoding="utf-8") as _f:
    _DATA = json.load(_f)

_RAW_VERSION = str(_DATA.get("version", "1.2"))
GOVERNANCE_TAXONOMY_VERSION = f"v{_RAW_VERSION}" if not _RAW_VERSION.startswith("v") else _RAW_VERSION

# ── Parent categories ───────────────────────────────────────────────────────
EXCLUDED_CATEGORY = "EXCLUDED"

GOVERNANCE_CATEGORIES: dict[str, dict[str, str]] = {
    code: {
        "label_en": meta["label_en"],
        "label_fr": meta["label_fr"],
    }
    for code, meta in _DATA["categories"].items()
}

# ── Subtypes ────────────────────────────────────────────────────────────────
EXCLUDED_SUBTYPE = "EXCLUDED_NON_SSE"

# Ordered: drives prompt rendering and any UI listing.
GOVERNANCE_SUBTYPES: dict[str, dict[str, str]] = {
    code: {
        "category": meta["category"],
        "label_en": meta["label_en"],
        "label_fr": meta["label_fr"],
        "scope_note": meta["scope_note_en"],
        "scope_note_en": meta["scope_note_en"],
        "scope_note_fr": meta.get("scope_note_fr", ""),
    }
    for code, meta in _DATA["subtypes"].items()
}

# ── Derived lookups ─────────────────────────────────────────────────────────
#: The 14 SSE governance subtypes (EXCLUDED_NON_SSE is not one of them).
SSE_SUBTYPES: frozenset[str] = frozenset(GOVERNANCE_SUBTYPES)

#: Every valid stored subtype code, including the excluded special value.
VALID_SUBTYPES: frozenset[str] = SSE_SUBTYPES | {EXCLUDED_SUBTYPE}

#: Every valid stored category code, including EXCLUDED.
VALID_CATEGORIES: frozenset[str] = frozenset(GOVERNANCE_CATEGORIES)

SUBTYPE_TO_CATEGORY: dict[str, str] = {
    code: meta["category"] for code, meta in GOVERNANCE_SUBTYPES.items()
}
SUBTYPE_TO_CATEGORY[EXCLUDED_SUBTYPE] = EXCLUDED_CATEGORY

_MAX_OPERATIONAL_TAGS = 8
_MAX_OPERATIONAL_TAG_LEN = 48
_OP_TAG_RE = re.compile(r"[^a-z0-9_]+")


def category_for_subtype(subtype: str | None) -> str | None:
    """Return the parent category code for a subtype (``None`` if unknown)."""
    if not subtype:
        return None
    return SUBTYPE_TO_CATEGORY.get(subtype)


def normalize_subtype(raw: Any) -> str | None:
    """Accept only the controlled subtype codes; everything else → ``None``.

    Tolerates casing and surrounding whitespace in the model's output.
    """
    if not raw:
        return None
    code = str(raw).strip().upper()
    return code if code in VALID_SUBTYPES else None


def normalize_category(raw: Any) -> str | None:
    """Accept only the controlled category codes; everything else → ``None``."""
    if not raw:
        return None
    code = str(raw).strip().upper()
    return code if code in VALID_CATEGORIES else None


def normalize_operational_tags(raw: Any) -> list[str]:
    """Lightly normalize free-text operational tags to snake_case tokens.

    Deduplicates, caps token length and count, and drops empties. Tags are an
    open vocabulary (platform_coop, b2b_procurement, digital_commons, …), so we
    normalize shape but do not whitelist values.
    """
    if not isinstance(raw, (list, tuple)):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not item:
            continue
        tag = _OP_TAG_RE.sub("_", str(item).strip().lower()).strip("_")
        tag = tag[:_MAX_OPERATIONAL_TAG_LEN].strip("_")
        if tag and tag not in seen:
            seen.add(tag)
            out.append(tag)
        if len(out) >= _MAX_OPERATIONAL_TAGS:
            break
    return out


def resolve_governance(
    subtype: str | None,
    category: str | None,
    *,
    is_sse: bool,
) -> tuple[str | None, str | None]:
    """Reconcile model governance output with the SSE gate.

    Single source of truth tying the taxonomy to ``is_sse``:
      - Not SSE  → always EXCLUDED_NON_SSE / EXCLUDED.
      - SSE + a valid SSE subtype → keep it; derive the category from the
        subtype (ignore any mismatched category the model returned).
      - SSE but no usable subtype → leave ``None`` so the org reads as
        incomplete and is re-assessed (never invent a subtype).
    """
    subtype = normalize_subtype(subtype)
    if not is_sse:
        return EXCLUDED_SUBTYPE, EXCLUDED_CATEGORY
    if subtype and subtype in SSE_SUBTYPES:
        return subtype, SUBTYPE_TO_CATEGORY[subtype]
    # SSE yes but the model gave EXCLUDED_NON_SSE or nothing usable.
    return None, None


def format_governance_taxonomy_prompt() -> str:
    """Render the governance dictionary + boundary rules for the LLM prompt."""
    lines: list[str] = [
        "GOVERNANCE TAXONOMY (classify the organization's governance FORM):",
        "",
        "CLASSIFICATION PRINCIPLES:",
        "1. GOVERNANCE-FIRST: classify strictly by WHO holds structural "
        "ownership and democratic voting rights — the underlying legal and "
        "democratic governance structure.",
        "2. OPERATIONAL SEPARATION: do NOT classify by technology, business "
        "model, or platform. Delivery modes such as platform co-ops, gig apps, "
        "talent clouds, or social-purchasing portals are operational tags, NOT "
        "governance types (e.g. a driver-owned ride-hailing app is "
        "GOV_1_1_WORKER_COOP with operational_tags [\"platform_coop\"]).",
        "3. EXCLUSIONS → EXCLUDED_NON_SSE when any apply: investor-owned / "
        "private for-profits; top-down non-profits with self-perpetuating "
        "donor/corporate boards and no worker or voting-member power; "
        "SETTLER-COLONIAL state entities (federal/provincial/municipal "
        "governments, Crown corporations, state-owned utilities, hospital authorities and ministry-run "
        "facilities with government-appointed boards, public universities/colleges as state institutions) — NOT "
        "independent registered-charity / non-profit hospitals that merely receive "
        "public health-system funding; corporate trade associations "
        "(chambers of commerce, industry lobbies); registered political parties "
        "/ electoral campaign organizations; and extractive co-ops that "
        "violate SSE decent-work or ecological criteria. INDIGENOUS GOVERNMENTS: "
        "Indigenous Nation enterprises exercising community self-determination "
        "(e.g., Band Council-owned resource stewardship, iwi trusts, autonomous "
        "municipality cooperatives) are NOT excluded — classify as GOV_3_2_INDIGENOUS_LAND_TRUST. The "
        "distinction is community self-governance (subsidiarity, Indigenous "
        "sovereignty) vs. colonial state administration. Only exclude Indigenous "
        "entities that function as delegated colonial state administrators. Do NOT "
        "exclude citizens' advocacy, civic campaign, or public-interest movement "
        "nonprofits merely because they advocate rather than trade — those "
        "are typically GOV_4_1_MEMBER_NPO (or another GOV_4/GOV_5 subtype) "
        "when SSE Yes, never EXCLUDED_NON_SSE for 'not an enterprise'.",
        "",
        "CONTROLLED SUBTYPE DICTIONARY (choose exactly one subtype code):",
    ]
    current_cat: str | None = None
    for code, meta in GOVERNANCE_SUBTYPES.items():
        cat = meta["category"]
        if cat != current_cat:
            current_cat = cat
            cat_meta = GOVERNANCE_CATEGORIES[cat]
            lines.append("")
            lines.append(f"{cat} — {cat_meta['label_en']}:")
        lines.append(f"  - {code}: {meta['label_en']}. {meta['scope_note']}")
    lines.append("")
    lines.append(
        f"  - {EXCLUDED_SUBTYPE}: Entity fails SSE democratic-governance, "
        "non-extractive, or state-autonomy criteria (category EXCLUDED)."
    )
    return "\n".join(lines)
