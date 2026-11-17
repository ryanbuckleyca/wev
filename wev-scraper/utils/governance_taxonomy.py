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

import re
from typing import Any

GOVERNANCE_TAXONOMY_VERSION = "v1.1"

# ── Parent categories ───────────────────────────────────────────────────────
EXCLUDED_CATEGORY = "EXCLUDED"

GOVERNANCE_CATEGORIES: dict[str, dict[str, str]] = {
    "GOV_1": {
        "label_en": "Democratic Member-Owned Cooperatives",
        "label_fr": "Coopératives démocratiques à propriété collective",
    },
    "GOV_2": {
        "label_en": "Mutual Benefit & Financial Institutions",
        "label_fr": "Mutuelles et institutions financières",
    },
    "GOV_3": {
        "label_en": "Collective Asset Stewardship & Land Trusts",
        "label_fr": "Fiducies foncières et gestion d'actifs collectifs",
    },
    "GOV_4": {
        "label_en": "Participatory Non-Profits & Social Enterprises",
        "label_fr": "OBNL participatifs et entreprises sociales",
    },
    "GOV_5": {
        "label_en": "Grassroots & Popular Economy Collectives",
        "label_fr": "Collectifs de l'économie populaire et de terrain",
    },
    EXCLUDED_CATEGORY: {
        "label_en": "Excluded (non-SSE)",
        "label_fr": "Exclu (hors ÉSS)",
    },
}

# ── Subtypes ────────────────────────────────────────────────────────────────
EXCLUDED_SUBTYPE = "EXCLUDED_NON_SSE"

# Ordered: drives prompt rendering and any UI listing.
GOVERNANCE_SUBTYPES: dict[str, dict[str, str]] = {
    "GOV_1_1_WORKER_COOP": {
        "category": "GOV_1",
        "label_en": "Worker Cooperative",
        "label_fr": "Coopérative de travail",
        "scope_note": (
            "Enterprise owned and managed entirely by its workers, where labor "
            "contribution determines governance rights and surplus distribution."
        ),
    },
    "GOV_1_2_CONSUMER_COOP": {
        "category": "GOV_1",
        "label_en": "Consumer / Customer Cooperative",
        "label_fr": "Coopérative de consommateurs",
        "scope_note": (
            "Enterprise owned by the households or users purchasing its goods or "
            "services (food co-ops, housing co-ops, utility co-ops)."
        ),
    },
    "GOV_1_3_PRODUCER_COOP": {
        "category": "GOV_1",
        "label_en": "Producer / Supplier Cooperative",
        "label_fr": "Coopérative de producteurs",
        "scope_note": (
            "Enterprise formed by independent farmers, artisans, or small "
            "producers to pool equipment and collectively market goods."
        ),
    },
    "GOV_1_4_SOLIDARITY_COOP": {
        "category": "GOV_1",
        "label_en": "Multi-Stakeholder / Solidarity Cooperative",
        "label_fr": "Coopérative de solidarité",
        "scope_note": (
            "Governance distributes voting power across worker, user/consumer, "
            "and community-supporter membership colleges on a single board."
        ),
    },
    "GOV_2_1_CREDIT_UNION": {
        "category": "GOV_2",
        "label_en": "Credit Union / Caisse Populaire",
        "label_fr": "Caisse populaire / Credit union",
        "scope_note": (
            "Member-owned financial institution providing non-extractive "
            "savings, lending, and community finance."
        ),
    },
    "GOV_2_2_MUTUAL_INSURANCE": {
        "category": "GOV_2",
        "label_en": "Mutual Insurance Society",
        "label_fr": "Société mutuelle d'assurance",
        "scope_note": (
            "Policyholder-owned risk-pooling enterprise where surpluses are "
            "retained or returned to members."
        ),
    },
    "GOV_3_1_COMMUNITY_LAND_TRUST": {
        "category": "GOV_3",
        "label_en": "Community Land Trust (CLT)",
        "label_fr": "Fiducie foncière communautaire",
        "scope_note": (
            "Non-profit trust holding underlying residential, commercial, or "
            "ecological land permanently off the speculative market."
        ),
    },
    "GOV_3_2_INDIGENOUS_LAND_TRUST": {
        "category": "GOV_3",
        "label_en": "Indigenous & Sovereign Land Trust",
        "label_fr": "Fiducie foncière autochtone et souveraine",
        "scope_note": (
            "Autonomous, community-governed Indigenous land trust, urban "
            "Indigenous stewardship society, or non-state settlement/"
            "conservation trust that rematriates and protects ancestral lands "
            "outside the speculative market — distinct from public Indigenous "
            "governments (band councils, land-claim governments), which remain "
            "excluded from the enterprise taxonomy."
        ),
    },
    "GOV_4_1_MEMBER_NPO": {
        "category": "GOV_4",
        "label_en": "Member-Governed Non-Profit",
        "label_fr": "Organisme sans but lucratif (OBNL)",
        "scope_note": (
            "Non-profit corporation whose ultimate authority rests in an active, "
            "voting community membership base (not a self-perpetuating board)."
        ),
    },
    "GOV_4_2_WISE": {
        "category": "GOV_4",
        "label_en": "Work Integration Social Enterprise",
        "label_fr": "Entreprise d'insertion (WISE)",
        "scope_note": (
            "Mission-driven trading entity structured to train and reintegrate "
            "marginalized job seekers into sustainable labor."
        ),
    },
    "GOV_4_3_COMMUNITY_DEV_CORP": {
        "category": "GOV_4",
        "label_en": "Community Development Corporation",
        "label_fr": "Corporation de développement (CDEC)",
        "scope_note": (
            "Resident-directed non-profit revitalizing neighborhoods, developing "
            "housing, and building community wealth."
        ),
    },
    "GOV_5_1_MUTUAL_AID": {
        "category": "GOV_5",
        "label_en": "Mutual Aid Network",
        "label_fr": "Réseau d'entraide mutuelle",
        "scope_note": (
            "Unincorporated, horizontal community network practicing direct "
            "resource sharing and solidarity care."
        ),
    },
    "GOV_5_2_POPULAR_COLLECTIVE": {
        "category": "GOV_5",
        "label_en": "Popular Economy Collective",
        "label_fr": "Collectif d'économie populaire",
        "scope_note": (
            "Self-organized association of marginalized or informal workers "
            "pooling tools, safety nets, and workspaces."
        ),
    },
    "GOV_5_3_DEMOCRATIC_UNION": {
        "category": "GOV_5",
        "label_en": "Democratic Labor Union Local",
        "label_fr": "Syndicat démocratique local",
        "scope_note": (
            "Member-controlled workplace union exercising collective bargaining "
            "and democratic worker governance to advance decent work across "
            "the SSE."
        ),
    },
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
        "government / state entities (public hospitals, universities, colleges, "
        "Crown corporations, municipal bodies); corporate trade associations "
        "(chambers of commerce, industry lobbies); registered political parties "
        "/ electoral campaign organizations; and extractive co-ops that "
        "violate SSE decent-work or ecological criteria. Do NOT exclude "
        "citizens' advocacy, civic campaign, or public-interest movement "
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
