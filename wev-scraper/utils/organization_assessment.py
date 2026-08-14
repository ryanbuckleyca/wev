"""Single grounded LLM call for organization assessment.

Replaces OrganizationIdentifier + OrganizationSSEClassifier with one call that:
- Identifies the org (canonical name, slug, website, description, type)
- Extracts mission statement
- Maps values to the Knowdell taxonomy
- Produces SSE rating

Requirements: 4.1, 4.2, 4.4, 4.5, 5.1, 5.2, 5.3
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Any, List, TypedDict, Optional
from urllib.parse import urlparse

from llm.base import LLMProviderError
from llm.factory import get_sse_provider
from utils.base_grounded_classifier import BaseGroundedClassifier, SSEClassificationError
from utils.job_values_prompts import get_taxonomy, get_work_values_set
from utils.sector_prompts import get_formatted_sector_taxonomy, get_sector_ids_set
from utils.organization_cache import evidence_domain, extract_domain
from utils.organization_language import (
    VALID_ORG_LANGUAGES,
    classify_org_language,
)
from utils.slug import generate_slug
from utils.location_parser import parse_address_with_geocodio
from utils.sse_prompts import (
    JSON_INSTRUCTIONS,
    LENGTH_LIMITED_FIELD_RULES,
    ORG_EVALUATION_CRITERIA,
    ORG_RATING_GUIDELINES,
    SSE_PRINCIPLES,
)

logger = logging.getLogger(__name__)

ORG_TYPE_VALUES = (
    "nonprofit",
    "cooperative",
    "government",
    "union",
    "other",
)

# Map normalized keys (spaces/hyphens stripped) → canonical stored type.
# Mutual / community labels alias to nonprofit until a taxonomy branch
# introduces dedicated terms. Former "social enterprise" → other.
_ORG_TYPE_ALIASES: dict[str, str] = {
    "nonprofit": "nonprofit",
    "cooperative": "cooperative",
    "socialenterprise": "other",
    "mutual": "nonprofit",
    "mutualaid": "nonprofit",
    "mutualaidgroup": "nonprofit",
    "mutualsociety": "nonprofit",
    "community": "nonprofit",
    "communityassociation": "nonprofit",
    "communityproject": "nonprofit",
    "creditunion": "cooperative",
    "union": "union",
    "government": "government",
    "other": "other",
}

# Hard length limits for stored LLM fields. Keep in sync with
# wev-bulletin/lib/organizations/constants.ts (description/mission).
# Prompt asks the model to paraphrase within the limit. If it overshoots,
# assess() truncates with _smart_truncate (sentence-aware).
_ORG_DESCRIPTION_MAX_CHARS = 500
_ORG_MISSION_MAX_CHARS = 500
_ORG_VALUES_RAW_MAX_CHARS = 1000
# Short evidence summary only — criterion lists live in must_haves_met / nice_to_haves_met.
_SSE_REASONING_MAX_CHARS = 400

# Truncate job-listing notes fed into the prompt only (not stored org fields).
_PROMPT_DESC_MAX_CHARS = 1000

_JSON_FIELDS = """{
  "canonical_name": "Official organization name (string, required, non-empty)",
  "slug": "url-safe-kebab-case (string, required)",
  "website": "Employer's own homepage URL (https://...), or null — see WEBSITE RULES",
  "description_en": "Organization description in English (strictly under 400 chars / ~45 words — extract exactly or closely from source if possible. Record provenance in flags as 'description via=extracted|inferred|absent'), or null",
  "description_fr": "Same description in French (strictly under 400 chars / ~45 words — translate accurately if not present in French on source), or null",
  "mission_statement_en": "Organization mission/purpose in English (strictly under 400 chars / ~45 words — ONLY extract if the organization explicitly states their mission/purpose on their own website or materials. Do NOT infer or compose a mission statement. If not found, use null. Record provenance in flags as 'mission via=extracted|absent'), or null",
  "mission_statement_fr": "Same mission/purpose in French (strictly under 400 chars / ~45 words — translate accurately if found in English, or extract if present in French on source. If not found, use null), or null",
  "type": "One of: nonprofit, cooperative, government, union, other — or null. IMPORTANT: Classify based on governance control and ownership, not mission language alone. Type is a filter, not a Yes by itself — SSE Yes still requires must-haves from research. If an entity is created by government statute, has its governing body appointed by government (a minister, cabinet, or a public authority), and its mandate is set externally by government rather than by an autonomous membership, classify it as 'government', regardless of whether it is incorporated as a nonprofit. A city/town/region name in the organization name is geographic branding only — NOT evidence of municipal/government status. Community orchestras, choirs, bands, theatres, and similar arts associations are typically 'nonprofit', not 'government', unless research shows a city department or statutory public body. Reserve 'nonprofit' for organizations autonomously governed as charities/nonprofits (independent board, non-distribution) — map mutuals/community groups to nonprofit; board+ED charities stay nonprofit (never 'other' for lacking cooperative labels). Use 'cooperative' for worker/consumer/producer coops and credit unions. Use 'other' for conventional for-profits, privately owned mission-driven businesses (including private nature/forest schools), and political parties / electoral organizations (parties are NOT 'government'). Do NOT invent a social-enterprise type.",
  "sector_id": "Sector ID from the ALLOWED SECTORS list below, or null if none fit well",
  "values_raw": "Organization values and principles if found on their website (strictly under 800 chars / ~100 words — extract closely from source. Record provenance in flags as 'values via=extracted|inferred|absent'), or null",
  "values": ["List of mapped Knowdell work values (see taxonomy below), max 5 values"],
  "sse_rating": "strong_yes or weak_yes or no",
  "sse_confidence": "0.0 to 1.0",
  "sse_reasoning_en": "2–3 concise English sentences citing the key evidence for the rating (strictly under 320 chars / ~35 words — paraphrase to fit completely). Do NOT restate must_haves_met or nice_to_haves_met — those belong only in their arrays",
  "sse_reasoning_fr": "Same reasoning in French (strictly under 320 chars / ~35 words — paraphrase to fit completely)",
  "must_haves_met": ["ONLY org must-have labels from ORG MUST-HAVES 1–3 below — never job/posting criteria"],
  "nice_to_haves_met": ["ONLY org nice-to-have labels from ORG NICE-TO-HAVES below — never job/posting criteria"],
  "flags": ["REQUIRED — see FLAGS RULES below"],
  "public_language": "Primary language of the organization's own public materials (website, postings, documents, reports) observed during research. Use only: en, fr, bilingual, or null. Do not use the language of this response as evidence. Prefer bilingual when the organization publishes substantial public materials in both English and French (or both EN and FR sites).",
  "geographic_scope": "Geographic reach of the organization based on evidence from their website and materials. Use: local (serves a single city/town/region), provincial (serves a single province), national (serves all or most of Canada), international (operates in multiple countries), or null if unclear. Base this on service area, chapters/locations, or mission statement, not just the organization name."
}"""

_ORG_CRITERION_LABEL_RULES = """ORG MUST-HAVES / NICE-TO-HAVES LABELS (strict — org assessment only):
- must_haves_met may ONLY list short labels for org must-haves 1–3 from ORG EVALUATION CRITERIA:
  1) Clear purpose beyond profit
  2) Impact described intentionally
  3) Organization's work contributes to social/community/environmental good
- nice_to_haves_met may ONLY list short labels from org nice-to-haves 4–8
  (solidarity culture, participatory governance, SSE governance model, investment in people,
  mission reinvestment).
- NEVER include job-posting criteria such as: "Transparent compensation", salary disclosure,
  "Clear job expectations", posting language, remote/hybrid, or other employment-ad must-haves.
  Those belong ONLY to job classification — they are stale if copied into org must_haves_met.
- If evidence is only about a job ad (pay, duties, location), do not invent org must-haves from that alone."""

_FLAGS_RULES = """FLAGS RULES (mandatory — same shape as language provenance):
For EACH of description, mission, and values include exactly one flag:
  description via=extracted|inferred|absent
  mission via=extracted|absent  (NEVER inferred — only use extracted or absent)
  values via=extracted|inferred|absent

Use:
- via=extracted — ONLY when you found the text on the organization's OWN official website or materials (not third-party descriptions, not news articles, not directories). If the supporting web evidence does NOT include the organization's own domain, you MUST use via=inferred (for description/values) or via=absent (for mission), NOT via=extracted.
- via=inferred — you composed or guessed it from secondary sources, third-party descriptions, or mapped it from other text (including mapping Knowdell values from other text). ONLY valid for description and values fields. NEVER use for mission.
- via=absent — you returned null/empty for that field

CRITICAL: If the organization's own website was unavailable or not found in the search results, ALL fields MUST be via=inferred (description/values) or via=absent (mission/missing fields), NEVER via=extracted.

CRITICAL: Mission statements MUST ONLY be extracted from the organization's own explicit statement of mission/purpose. Do NOT compose, infer, or synthesize mission statements. If no explicit mission statement is found, use null and flag as 'mission via=absent'.

Language provenance is added by code after your response (language:… via=… /
language_reason:…). Do not invent language flags yourself.

Also add when relevant:
- website_unavailable — when the org's own website was unreachable or not found in search results
- any other short concern labels

Most organizations do NOT explicitly publish a mission statement or values list —
use mission via=absent / values via=inferred when not found on their site."""

_BILINGUAL_COPY_RULES = """BILINGUAL PUBLIC COPY (required):
- Always provide BOTH English and French for description_*, mission_statement_*, and sse_reasoning_* when you have enough evidence to write the field at all.
- If you can write the English version, also write the French version (and vice versa) — do not leave one locale null when the other is present.
- Write natural French (not word-for-word calque) and natural English.
- Knowdell "values" labels stay in English (taxonomy keys). values_raw may stay in the source language of the website.
- must_haves_met / nice_to_haves_met / flags stay in English short labels.
- must_haves_met / nice_to_haves_met must follow ORG CRITERION LABEL RULES (org criteria only — never compensation)."""

_WEBSITE_RULES = """WEBSITE RULES for the "website" field:
- Extract the BEST AVAILABLE URL from research/search results.
- ACCEPT any URL that identifies this specific organization, including:
  * Official homepages (preferred)
  * Marketplace/directory pages
  * Social media pages - these are VALID if they have organization info
- If you find ANY URL in the grounding evidence, return it.
- Social media and marketplace pages are LEGITIMATE web presences for small organizations.
- If ORGANIZATION DATA lists a Known website that looks wrong (different location/name),
  REPLACE IT with any better URL you find in the grounding evidence.
- Do NOT use job-board or ATS URLs (Greenhouse, Lever, Workday, Indeed, CharityVillage).
- Do NOT use link aggregators (Linktree, bit.ly).
- Do NOT use the scraped job listing URL itself.
- If you cannot find ANY URL in research/grounding evidence, return null.
- Prefer https:// and prefer homepages over deep paths."""

_PUBLIC_LANGUAGE_RULES = """PUBLIC_LANGUAGE RULES:
Priority for public_language (en | fr | bilingual | null):
1. Actual public-facing website language in materials you observed
2. Explicit website language metadata
3. hreflang or URL locale hints (/en/, /fr/, lang=, locale=)
4. Organization name only as weak evidence
- Verify name leaning against the organization's own materials you observed.
- Do not infer from the language of this JSON response.
- Return bilingual when materials show substantial English AND French
  (or an explicit bilingual claim) — including Canadian charities/foundations with
  an EN site plus FR pages, FR toggle, /fr/ paths, or French program materials in
  the research evidence. Prefer bilingual over en-only in those cases.
- Do NOT upgrade to bilingual merely from a French or English legal name,
  accented characters in the name, or a .ca domain alone.
- Canadian / multinational engineering or environmental consultancies whose primary
  corporate site is English → en. A thin FR landing page, careers locale, or
  translated brochure does NOT make them bilingual.
- If you only observed one locale and no bilingual signals, return that locale.
- If there is insufficient evidence, return null."""

_SECTOR_PRIORITY_RULES = """SECTOR PRIORITY (when multiple sectors could fit):
- Score the organization's primary activity / service line, not a secondary theme.
- Private environmental / water / geoscience / engineering consultancies
  (including multi-discipline firms whose core line is environmental science,
  water resources, remediation, or environmental engineering) →
  environment-circular-economy (not community-civic-infrastructure).
- Foundations whose core program is education / fellowships → education-knowledge.
- Arts marketing, audience development, cultural fundraising, ticketing /
  subscription services for arts organizations, or arts-information services →
  arts-culture-information (not care-health-social-services; not
  community-civic-infrastructure merely because clients are nonprofits or
  "community" appears in marketing copy).
- community-civic-infrastructure is residual/catch-all — prefer a more specific
  sector whenever one applies."""

_SOURCE_DESCRIPTION_RULES = """SOURCE DESCRIPTION vs INTERPRETIVE FIELDS (mandatory):
- is_sse / sse_rating, sector_id, public_language, type, website, mission_statement_*,
  and values MUST come from official-website / supporting web research only.
- NEVER use SOURCE DESCRIPTION (stored org blurb or job-listing body) to decide those
  interpretive fields — listing copy is often wrong, stale, or about a related brand.
- description_* only:
  • If SOURCE DESCRIPTION is present: extract/adapt from it (flag description via=extracted).
    Do NOT call on search snippets to rewrite or replace it.
  • If SOURCE DESCRIPTION is absent: you may write description_* from web evidence
    (via=inferred or via=extracted from web). This is the only case search may
    supply description text.
- LISTING / IDENTITY HINTS (job title, listing notes) are for disambiguating which
  employer is meant — never for SSE rating, sector, language, type, or values."""

_combined_prompt = """You are evaluating an ORGANIZATION (employer), not a job posting.
Identify the organization, extract its values and mission from research about the
org itself, and assess its Solidarity Economy (SSE) alignment.

{SSE_PRINCIPLES}

{ORG_EVALUATION_CRITERIA}

{ORG_RATING_GUIDELINES}

{org_criterion_label_rules}

{source_description_rules}

ALLOWED SECTORS for the "sector_id" field:
{sector_taxonomy_formatted}

{sector_priority_rules}

ALLOWED VALUES for the "values" field (use ONLY labels from this list):
{taxonomy_formatted}

RULES for the "values" field:
- Values must exactly match labels from the ALLOWED VALUES list above (case-sensitive).
- Choose 3 to 5 values from official-website / supporting web research about the org
  (mission, governance, public materials) — NOT from SOURCE DESCRIPTION or listing notes.
- Do NOT include labels not in the ALLOWED VALUES list.
- Do NOT include duplicates.
- "Help Society" and "Community" are distinct — use both if evidence supports both.
- Be honest: if you can't determine values from web research, return an empty array.

{website_rules}

{bilingual_copy_rules}

{public_language_rules}

{length_limited_field_rules}

{JSON_INSTRUCTIONS}

ORGANIZATION DATA:
  Raw name:    {raw_name}
  Municipality: {municipality}
  Province:     {province}
  Known website: {known_website}
  Job title (identity hint only): {job_title}
  Listing notes (identity hint only — not for interpretive fields):
{listing_notes}

SOURCE DESCRIPTION (for description_* only — omit if none):
{source_description}

Return a JSON object with exactly these fields:
{json_fields}
"""


class AssessedOrgResult(TypedDict):
    canonical_name: str
    slug: str
    website: str | None
    description_en: str | None
    description_fr: str | None
    mission_statement_en: str | None
    mission_statement_fr: str | None
    type: str | None
    sector_id: str | None
    values_raw: str | None
    values: List[str]
    sse_rating: str
    sse_confidence: float
    sse_reasoning_en: str | None
    sse_reasoning_fr: str | None
    must_haves_met: List[str]
    nice_to_haves_met: List[str]
    flags: List[str]
    public_language: str | None
    geographic_scope: str | None


_TAXONOMY_STR: str | None = None


def _format_taxonomy() -> str:
    global _TAXONOMY_STR
    if _TAXONOMY_STR is None:
        lines: list[str] = []
        for v in get_taxonomy():
            lines.append(f'{v.label}: {v.definition}')
        _TAXONOMY_STR = "\n".join(lines)
    return _TAXONOMY_STR


def _build_assessment_prompt(
    raw_name: str,
    municipality: str | None,
    province: str | None,
    job_title: str,
    description: str = "",
    known_website: str | None = None,
    *,
    existing_description: str | None = None,
    listing_notes: str | None = None,
) -> str:
    """Build the org-assessor prompt.

    *description* is legacy: treated as listing notes unless *existing_description*
    is passed. Listing notes never gate Tavily and must not drive interpretive fields.
    """
    known = ""
    if known_website and evidence_domain(known_website):
        known = known_website.strip()
    source = (existing_description if existing_description is not None else "") or ""
    notes = (listing_notes if listing_notes is not None else description) or ""
    source_block = source.strip()[:_PROMPT_DESC_MAX_CHARS] or "(none)"
    notes_block = notes.strip()[:_PROMPT_DESC_MAX_CHARS] or "(none)"
    return _combined_prompt.format(
        SSE_PRINCIPLES=SSE_PRINCIPLES,
        ORG_EVALUATION_CRITERIA=ORG_EVALUATION_CRITERIA,
        ORG_RATING_GUIDELINES=ORG_RATING_GUIDELINES,
        org_criterion_label_rules=_ORG_CRITERION_LABEL_RULES,
        source_description_rules=_SOURCE_DESCRIPTION_RULES,
        raw_name=raw_name,
        municipality=municipality or "",
        province=province or "",
        known_website=known or "(none — discover the employer-owned homepage)",
        job_title=job_title,
        listing_notes=notes_block,
        source_description=source_block,
        json_fields=_JSON_FIELDS,
        sector_taxonomy_formatted=get_formatted_sector_taxonomy(),
        taxonomy_formatted=_format_taxonomy(),
        website_rules=_WEBSITE_RULES,
        bilingual_copy_rules=_BILINGUAL_COPY_RULES,
        public_language_rules=_PUBLIC_LANGUAGE_RULES,
        sector_priority_rules=_SECTOR_PRIORITY_RULES,
        JSON_INSTRUCTIONS=JSON_INSTRUCTIONS,
        length_limited_field_rules=LENGTH_LIMITED_FIELD_RULES,
    )


def _build_search_query(
    raw_name: str,
    municipality: str | None = None,
    province: str | None = None,
    known_website: str | None = None,
) -> str:
    """Grounding query aimed at finding the organization's web presence.

    Includes location prominently to avoid matching organizations with similar
    names in different regions/countries. Does NOT include "official website"
    since that biases search toward generic content and misses marketplace/social pages.
    """
    # Start with quoted name and Canada to avoid international matches
    parts = [f'"{raw_name}"']

    # Add location BEFORE other terms to make it prominent in search
    if municipality and province:
        parts.append(f"{municipality}, {province}, Canada")
    elif province:
        parts.append(f"{province}, Canada")
    elif municipality:
        parts.append(f"{municipality}, Canada")
    else:
        parts.append("Canada")

    # Do NOT add "official website" - it biases toward generic content
    # and misses marketplace pages and social media

    # Only include known_website if it's evidence-grade (not social/shared)
    if known_website and evidence_domain(known_website):
        parts.append(known_website.strip())

    return " ".join(parts)


def _normalize_type(raw: Any) -> str | None:
    if not raw:
        return None
    key = re.sub(r"[\s_-]+", "", str(raw).strip().lower())
    return _ORG_TYPE_ALIASES.get(key)


def _normalize_values(raw_values: Any, valid_set: set[str]) -> list[str]:
    if not isinstance(raw_values, list):
        return []
    seen: set[str] = set()
    values: list[str] = []
    for v in raw_values:
        label = str(v).strip() if v else ""
        if label in valid_set and label not in seen:
            seen.add(label)
            values.append(label)
    return values[:5]


def _validate_sse_rating(raw: Any) -> str:
    rating = str(raw or "").lower().strip()
    return rating if rating in ("strong_yes", "weak_yes", "no") else "no"


def _validate_public_language(raw: Any) -> str | None:
    """Accept only en | fr | bilingual; everything else → None."""
    if not raw:
        return None
    value = str(raw).strip().lower()
    return value if value in VALID_ORG_LANGUAGES else None


def _validate_geographic_scope(raw: Any) -> str | None:
    """Accept only local | provincial | national | international; everything else → None."""
    if not raw:
        return None
    value = str(raw).strip().lower()
    valid_scopes = {"local", "provincial", "national", "international"}
    return value if value in valid_scopes else None


# Known types that can never be SSE yes. Null/unknown type is NOT in this set.
# Eligible stored types (must agree with ORG_EVALUATION_CRITERIA): nonprofit,
# cooperative, union. Eligible type is necessary but not sufficient — must-haves
# still apply; type alone is never a Yes.
_SSE_INELIGIBLE_ORG_TYPES = frozenset({
    "government",
    "other",
})


_CONTENT_PROVENANCE_FIELDS = ("description", "mission", "values")
_CONTENT_VIA_STATUSES = frozenset({"extracted", "inferred", "absent"})


def _is_content_provenance_flag(flag: str) -> bool:
    """True for ``description via=…`` / legacy ``description_inferred`` style flags."""
    fl = flag.strip().lower()
    for field in _CONTENT_PROVENANCE_FIELDS:
        if fl.startswith(f"{field} via="):
            return True
        if fl in {
            f"{field}_extracted",
            f"{field}_inferred",
            f"{field}_absent",
        }:
            return True
    return False


def _content_via_from_flags(flags: list[str], field: str) -> str | None:
    """Return extracted|inferred|absent if already present (new or legacy form)."""
    field_l = field.lower()
    for raw in flags:
        if not isinstance(raw, str):
            continue
        fl = raw.strip().lower()
        prefix = f"{field_l} via="
        if fl.startswith(prefix):
            status = fl[len(prefix):].strip()
            if status in _CONTENT_VIA_STATUSES:
                return status
        for status in _CONTENT_VIA_STATUSES:
            if fl == f"{field_l}_{status}":
                return status
    return None


def _ensure_content_provenance_flags(result: AssessedOrgResult) -> AssessedOrgResult:
    """Ensure description/mission/values each have a ``field via=…`` flag.

    Matches language provenance shape (``language:en via=web_text``). If the
    model omitted provenance for a populated field, default to via=inferred
    (or via=absent for mission, which should never be inferred).
    """
    original = list(result.get("flags") or [])
    kept = [f for f in original if isinstance(f, str) and not _is_content_provenance_flag(f)]
    flags = list(kept)

    has_description = bool(
        result.get("description_en") or result.get("description_fr")
    )
    has_mission = bool(
        result.get("mission_statement_en") or result.get("mission_statement_fr")
    )
    has_values = bool(result.get("values") or result.get("values_raw"))
    present = {
        "description": has_description,
        "mission": has_mission,
        "values": has_values,
    }

    for field in _CONTENT_PROVENANCE_FIELDS:
        status = _content_via_from_flags(original, field)
        if status is None:
            # Mission should never be inferred - default to absent
            if field == "mission":
                status = "absent"
            else:
                status = "inferred" if present[field] else "absent"
        # Validate mission can only be extracted or absent
        if field == "mission" and status == "inferred":
            status = "absent"
            flags.append("mission_inferred_downgraded_to_absent")
        flags.append(f"{field} via={status}")

    if flags == original:
        return result
    return AssessedOrgResult(**{**result, "flags": flags})


def _apply_website_known_guard(
    result: AssessedOrgResult,
    known_website: str | None,
) -> AssessedOrgResult:
    """Allow website updates when discovered via grounding.

    Previously, this function always preferred known_website to prevent LLMs from
    inventing URLs. However, now that we use Tavily grounding and location validation,
    discovered websites are trustworthy and should replace potentially incorrect known URLs.

    The function now:
    1. Uses discovered website if found (from Tavily grounding)
    2. Falls back to known website only if no discovered website found
    3. Flags mismatches for auditing purposes
    """
    known = known_website.strip() if known_website else None

    discovered = result.get("website")
    discovered_clean = discovered.strip() if discovered else None

    if not discovered_clean:
        # No discovered website - fall back to known
        if flags := result.get("flags"):
            if not any("website" in str(f).lower() for f in flags):
                flags_list = list(flags)
                flags_list.append("website_not_found")
                result = AssessedOrgResult(**{**result, "flags": flags_list})
        return result if not known else AssessedOrgResult(**{**result, "website": known})

    # Discovered website exists - use it (trust Tavily + location validation)
    if known:
        discovered_domain = extract_domain(discovered_clean) or ""
        known_domain = extract_domain(known) or ""
        if discovered_domain and known_domain and discovered_domain != known_domain:
            # Flag that we're updating the website
            flags = list(result.get("flags") or [])
            flags.append(f"website_updated: {known_domain} -> {discovered_domain}")
            result = AssessedOrgResult(**{**result, "flags": flags})

    # Use discovered website
    return result


def _apply_org_sse_governance_guard(result: AssessedOrgResult) -> AssessedOrgResult:
    """Force 'no' only when type is known and ineligible for SSE yes."""
    if result["sse_rating"] == "no":
        return result
    org_type = result.get("type")
    if org_type is None:
        # Unknown type — do not demote a model Yes.
        return result
    if org_type not in _SSE_INELIGIBLE_ORG_TYPES:
        return result

    flags = list(result.get("flags") or [])
    flags.append(
        "governance_gate: non-SSE org type cannot be SSE yes "
        f"(type={org_type!r}; government and other are never SSE; "
        "eligible: nonprofit, cooperative, union)"
    )
    return AssessedOrgResult(
        **{
            **result,
            "sse_rating": "no",
            "flags": flags,
        }
    )


# Corporate legal suffixes that often mark private companies; many Canadian
# charities also use Inc., so demotion also requires missing charity registration
# evidence (see _apply_private_company_sse_guard).
_CORP_LEGAL_SUFFIX_RE = re.compile(
    r"\b(?:inc\.?|incorporated|ltd\.?|limited|llc|corp\.?|corporation|s\.?a\.?|"
    r"gmbh|plc)\b",
    re.IGNORECASE,
)

# Explicit private / commercial ownership signals in model text.
# Shareholders: positive ownership only — do not match "without shareholders".
_PRIVATE_COMPANY_EVIDENCE_RE = re.compile(
    r"for[- ]profits?|private(?:ly)?[- ]owned|private company|private business|"
    r"founder[- ]owned|owner[- ]operated|"
    r"(?:with|has|have)\s+(?:private\s+)?shareholders?|shareholder[- ]owned|"
    r"commercial (?:music|arts|education|school|program|enterprise)|"
    r"fee[- ]based (?:private|commercial)|tuition[- ]based|"
    r"privately (?:operated|run|owned)|conventional (?:for[- ]profit|private)",
    re.IGNORECASE,
)

# Charity / nonprofit registration — strongest keep signal for the
# private-company gate (CRA / letters patent / etc.).
_CHARITY_REGISTRATION_EVIDENCE_RE = re.compile(
    r"registered charity|charitable (?:status|registration|number|organization)|"
    r"charity (?:number|registration|status)|CRA\b|canada revenue|"
    r"501\s*\(\s*c\s*\)|non[- ]distribution|without share capital|"
    r"letters patent|incorporated as a (?:non[- ]?profit|charity)|"
    r"nonprofit corporation|not[- ]for[- ]profit corporation|"
    r"cooperative(?:s)? (?:registration|incorporation)|credit union",
    re.IGNORECASE,
)

# Strong soft nonprofit / public-benefit cues — keep Inc./Ltd. suffix-only
# Yes without demanding CRA boilerplate. Bare "nonprofit"/"charity"/
# "mission-driven"/bare "directors" are NOT enough (models invent those).
# Applied only after private/commercial demotion has already been checked.
_SOFT_NONPROFIT_EVIDENCE_RE = re.compile(
    r"public[- ]benefit|community (?:benefit|mission|service)|"
    r"volunteer board|without (?:private )?shareholders?|"
    r"volunteer[- ](?:run|led|based|driven|center|centre|organization)|"
    r"(?:staffed|composed|operated)\s+(?:by|mainly by|primarily by)\s+volunteers?|"
    r"non[- ]?profit(?:able)?(?:\s+organization)?|charitable\s+(?:mission|purpose|aims?)|"
    r"community[- ]based\s+(?:organization|service)|social\s+(?:mission|purpose)|"
    r"serves?\s+the\s+(?:community|public)|community\s+solidarity",
    re.IGNORECASE,
)


def _org_assessment_evidence_blob(result: AssessedOrgResult) -> str:
    parts = [
        result.get("sse_reasoning_en") or "",
        result.get("sse_reasoning_fr") or "",
        " ".join(str(x) for x in (result.get("flags") or [])),
        " ".join(str(x) for x in (result.get("must_haves_met") or [])),
        " ".join(str(x) for x in (result.get("nice_to_haves_met") or [])),
    ]
    return " ".join(parts)


def _demote_org_to_other_no(
    result: AssessedOrgResult,
    flag: str,
) -> AssessedOrgResult:
    flags = list(result.get("flags") or [])
    flags.append(flag)
    return AssessedOrgResult(
        **{
            **result,
            "type": "other",
            "sse_rating": "no",
            "flags": flags,
        }
    )


def _apply_private_company_sse_guard(
    result: AssessedOrgResult,
    raw_name: str,
) -> AssessedOrgResult:
    """Demote Yes when evidence is private/commercial without charity signals.

    Catches models that invent type=nonprofit + weak_yes for commercial
    Inc./Ltd. businesses (e.g. fee-based private music/education schools).

    Order: registration keep → private/commercial demotion → strong soft
    keep for suffix-only cases → corp-suffix demotion. Soft cues must not
    override explicit private/commercial ownership language. Bare
    nonprofit/charity fluff is not enough to keep an Inc. Yes.
    """
    if result["sse_rating"] not in ("strong_yes", "weak_yes"):
        return result

    name = (raw_name or result.get("canonical_name") or "").strip()
    blob = _org_assessment_evidence_blob(result)
    org_type = result.get("type")

    # Strongest keep: CRA / letters patent / charity registration.
    if _CHARITY_REGISTRATION_EVIDENCE_RE.search(blob):
        return result

    # Private/commercial ownership wins over soft mission/board language.
    if _PRIVATE_COMPANY_EVIDENCE_RE.search(blob):
        return _demote_org_to_other_no(
            result,
            "private_company_gate: private/for-profit evidence without "
            "charity/nonprofit registration → type=other, rating=no",
        )

    # Strong soft cues (volunteer board, public-benefit, without shareholders,
    # community benefit/mission/service) keep real Inc. charities without CRA.
    if _SOFT_NONPROFIT_EVIDENCE_RE.search(blob):
        return result

    # Inc./Ltd./Corp. nonprofit/unknown Yes without registration or strong
    # soft evidence — treat as conventional private company, not SSE.
    if _CORP_LEGAL_SUFFIX_RE.search(name) and org_type in ("nonprofit", None):
        return _demote_org_to_other_no(
            result,
            "private_company_gate: corporate legal suffix (Inc./Ltd./Corp.) "
            "without charity/nonprofit registration or strong nonprofit "
            "evidence → type=other, rating=no",
        )

    return result


# Community arts names wrongly typed as government from a place-name alone.
_COMMUNITY_ARTS_NAME_RE = re.compile(
    r"\b(?:orchestra|philharmonic|symphony|choir|chorale|"
    r"community (?:theatre|theater|band|chorus)|"
    r"wind (?:orchestra|ensemble|band))\b",
    re.IGNORECASE,
)
_EXPLICIT_GOVERNMENT_EVIDENCE_RE = re.compile(
    r"municipal (?:department|agency|government|employer|parks)|"
    r"city (?:department|agency)|town (?:council|department)|"
    r"public[- ]sector|crown corp|"
    r"statutory|created by (?:statute|legislation|government)|"
    r"appointed by (?:a )?(?:minister|council|cabinet|public authority)|"
    r"school board|public hospital|government (?:agency|department|body)|"
    r"provincial (?:agency|ministry)|federal (?:agency|department)",
    re.IGNORECASE,
)


def _apply_community_arts_place_name_guard(
    result: AssessedOrgResult,
    raw_name: str,
) -> AssessedOrgResult:
    """Correct government typing from city-in-name for community arts orgs.

    Place names in orchestra/choir/theatre titles are geographic branding, not
    municipal employment. Remap to nonprofit and restore a Yes floor when the
    model also forced No solely via that mis-type.
    """
    if result.get("type") != "government":
        return result

    name = (raw_name or result.get("canonical_name") or "").strip()
    if not _COMMUNITY_ARTS_NAME_RE.search(name):
        return result

    blob = _org_assessment_evidence_blob(result)
    if _EXPLICIT_GOVERNMENT_EVIDENCE_RE.search(blob):
        return result

    flags = list(result.get("flags") or [])
    flags.append(
        "place_name_guard: community arts org — city/place in name is not "
        "municipal/government evidence → type=nonprofit"
    )
    new_rating = result.get("sse_rating") or "no"
    if new_rating == "no":
        new_rating = "weak_yes"
        flags.append(
            "place_name_guard: restored weak_yes for community arts "
            "nonprofit after false government typing"
        )
    sector = result.get("sector_id")
    if sector in (None, "community-civic-infrastructure"):
        sector = "arts-culture-information"

    return AssessedOrgResult(
        **{
            **result,
            "type": "nonprofit",
            "sse_rating": new_rating,
            "sector_id": sector,
            "flags": flags,
        }
    )


_LENGTH_LIMITED_FIELDS: tuple[tuple[str, int], ...] = (
    ("description_en", _ORG_DESCRIPTION_MAX_CHARS),
    ("description_fr", _ORG_DESCRIPTION_MAX_CHARS),
    ("mission_statement_en", _ORG_MISSION_MAX_CHARS),
    ("mission_statement_fr", _ORG_MISSION_MAX_CHARS),
    ("values_raw", _ORG_VALUES_RAW_MAX_CHARS),
    ("sse_reasoning_en", _SSE_REASONING_MAX_CHARS),
    ("sse_reasoning_fr", _SSE_REASONING_MAX_CHARS),
)


def _fields_over_limit(result: AssessedOrgResult) -> dict[str, tuple[str, int]]:
    """Return {field: (text, max_chars)} for length-limited fields that overshoot."""
    over: dict[str, tuple[str, int]] = {}
    for field, max_chars in _LENGTH_LIMITED_FIELDS:
        value = result.get(field)
        if isinstance(value, str) and len(value) > max_chars:
            over[field] = (value, max_chars)
    return over


def _smart_truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    # find the last sentence boundary
    last_period = max(truncated.rfind('. '), truncated.rfind('! '), truncated.rfind('? '))
    if last_period > 0:
        return truncated[:last_period + 1]
    # fallback to last space
    last_space = truncated.rfind(' ')
    if last_space > 0:
        return truncated[:last_space] + '...'
    return truncated[:max_chars - 3] + '...'


def _parse_text_field(data: dict, key: str) -> str | None:
    val = data.get(key)
    if val:
        text = str(val).strip()
        return text or None
    return None


def _parse_website(raw: Any) -> str | None:
    """Keep http(s) employer-owned sites; allow social/marketplace as fallback.

    Previously rejected all shared domains (Facebook, LinkedIn, etc). Now allows
    them as valid web presences when they're the best available option, since
    many small organizations only have social media or marketplace pages.

    However, we still reject:
    - Link aggregators (Linktree, bit.ly)
    - Job boards and ATS platforms
    - Malformed URLs
    """
    if not raw:
        return None
    url = str(raw).strip()
    if not url:
        return None
    if "://" not in url:
        url = "https://" + url

    try:
        parsed = urlparse(url)
    except Exception:
        return None

    if parsed.scheme not in ("http", "https"):
        return None

    # Validate hostname exists and is not empty
    hostname = parsed.hostname
    if not hostname or not hostname.strip():
        return None

    # Basic hostname validation - must contain at least one dot and alphanumeric chars
    if "." not in hostname or not re.search(r"[a-z0-9]", hostname.lower()):
        return None

    # Reject link aggregators - these are NEVER valid org identities
    link_aggregators = {
        "linktr.ee",
        "bit.ly",
        "tinyurl.com",
        "t.co",
        "ow.ly",
        "buff.ly",
    }

    hostname_lower = hostname.lower().strip(".")
    if hostname_lower in link_aggregators:
        return None
    if any(hostname_lower.endswith("." + host) for host in link_aggregators):
        return None

    # Reject job boards and ATS platforms entirely - these are NOT valid org identifiers
    # Even with paths, these are job listing URLs, not organization websites
    # Only exception: Social media company pages (facebook.com/company, linkedin.com/company)
    # and ATS platforms with org-specific SUBDOMAINS (e.g., boards.greenhouse.io)
    # which are handled via the shared domain logic in extract_org_identity
    job_boards = {
        "indeed.com",
        "glassdoor.com",
        "charityvillage.com",
    }

    # Reject if it's a direct job board domain (with or without path)
    if hostname_lower in job_boards:
        return None
    if any(hostname_lower.endswith("." + host) for host in job_boards):
        # Allow ATS subdomains like boards.greenhouse.io, careers.greenhouse.io
        # These have org-specific paths and are tracked in shared domains
        # But reject direct subdomains of job boards (e.g., ca.indeed.com/jobs)
        return None

    return url


def _ensure_str_list(raw: Any) -> list[str]:
    return [str(item) for item in (raw if isinstance(raw, list) else [])]


def _clamp_confidence(raw: Any) -> float:
    if raw is None:
        return 0.5
    try:
        return max(0.0, min(1.0, float(raw)))
    except (TypeError, ValueError):
        return 0.5


def _parse_localized_text(data: dict, key_en: str, key_fr: str, legacy_key: str) -> tuple[str | None, str | None]:
    """Prefer explicit *_en/*_fr; fall back to legacy monolingual key as English."""
    en = _parse_text_field(data, key_en)
    fr = _parse_text_field(data, key_fr)
    if en is None and fr is None:
        en = _parse_text_field(data, legacy_key)
    return en, fr


def _parse_response(response_text: str, raw_name: str) -> AssessedOrgResult | None:
    text = BaseGroundedClassifier._extract_json_block(response_text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.warning(
            "OrganizationAssessor: failed to parse JSON for %r: %s — response: %r",
            raw_name, exc, response_text[:200],
        )
        return None

    if not isinstance(data, dict):
        logger.warning(
            "OrganizationAssessor: expected dict, got %s for %r",
            type(data).__name__, raw_name,
        )
        return None

    canonical_name = data.get("canonical_name")
    if not isinstance(canonical_name, str) or not canonical_name.strip():
        logger.warning(
            "OrganizationAssessor: empty canonical_name for %r",
            raw_name,
        )
        return None

    slug = _parse_text_field(data, "slug") or ""
    if not slug:
        slug = generate_slug(canonical_name)
        logger.warning(
            "OrganizationAssessor: LLM returned no slug for canonical_name=%r raw_name=%r — generated slug=%r",
            canonical_name, raw_name, slug,
        )

    description_en, description_fr = _parse_localized_text(
        data, "description_en", "description_fr", "description"
    )
    mission_en, mission_fr = _parse_localized_text(
        data, "mission_statement_en", "mission_statement_fr", "mission_statement"
    )
    reasoning_en, reasoning_fr = _parse_localized_text(
        data, "sse_reasoning_en", "sse_reasoning_fr", "sse_reasoning"
    )

    # Log what website the LLM returned (debug level to avoid routinely logging potentially sensitive fields)
    llm_website = data.get("website")
    logger.debug(f"LLM returned website field: {llm_website!r} for org {canonical_name}")

    result = AssessedOrgResult(
        canonical_name=canonical_name.strip(),
        slug=slug,
        website=_parse_website(llm_website),
        description_en=description_en,
        description_fr=description_fr,
        mission_statement_en=mission_en,
        mission_statement_fr=mission_fr,
        type=_normalize_type(data.get("type")),
        sector_id=data.get("sector_id") if data.get("sector_id") in get_sector_ids_set() else None,
        values_raw=_parse_text_field(data, "values_raw"),
        values=_normalize_values(data.get("values", []), get_work_values_set()),
        sse_rating=_validate_sse_rating(data.get("sse_rating")),
        sse_confidence=_clamp_confidence(data.get("sse_confidence")),
        sse_reasoning_en=reasoning_en,
        sse_reasoning_fr=reasoning_fr,
        must_haves_met=_strip_job_leaked_criterion_labels(
            _ensure_str_list(data.get("must_haves_met"))
        ),
        nice_to_haves_met=_strip_job_leaked_criterion_labels(
            _ensure_str_list(data.get("nice_to_haves_met"))
        ),
        flags=_ensure_str_list(data.get("flags")),
        public_language=_validate_public_language(data.get("public_language")),
        geographic_scope=_validate_geographic_scope(data.get("geographic_scope")),
    )
    gated = _apply_org_sse_governance_guard(_ensure_content_provenance_flags(result))
    # Place-name remaps government→nonprofit (+ Yes floor) before the private-
    # company gate so arts-derived Yes still faces Inc./commercial demotion.
    gated = _apply_community_arts_place_name_guard(gated, raw_name)
    return _apply_private_company_sse_guard(gated, raw_name)


def _append_language_provenance_flags(
    row: dict,
    *,
    language: str | None,
    via: str,
    reasons: tuple[str, ...] = (),
) -> None:
    """Record how organizations.language was chosen on sse_details.flags."""
    details = row.get("sse_details")
    if not isinstance(details, dict):
        details = {}
        row["sse_details"] = details
    else:
        # Copy so we don't mutate a shared prior dict in place.
        details = dict(details)
        row["sse_details"] = details

    flags = [
        f for f in (details.get("flags") or [])
        if isinstance(f, str) and not f.startswith("language")
    ]
    if language:
        flags.append(f"language:{language} via={via}")
    else:
        flags.append(f"language:unset via={via}")
    for reason in reasons[:6]:
        label = str(reason).strip()
        if not label:
            continue
        flag = f"language_reason:{label}"
        if flag not in flags:
            flags.append(flag)
    details["flags"] = flags


def _append_website_identity_flags(
    row: dict,
    website: str | None,
    identity: str | None,
) -> None:
    """Record website identity provenance on sse_details.flags.

    Tracks the type of website (employer_owned, marketplace, social_media, etc.)
    and the platform for shared hosting sites to enable filtering and review.
    """
    from utils.organization_cache import classify_identity_type, extract_platform

    details = row.get("sse_details")
    if not isinstance(details, dict):
        details = {}
        row["sse_details"] = details
    else:
        # Copy so we don't mutate a shared prior dict in place
        details = dict(details)
        row["sse_details"] = details

    # Remove existing website via/platform flags (preserve other website_* flags)
    flags = [
        f for f in (details.get("flags") or [])
        if isinstance(f, str)
        and not f.startswith("website via=")
        and not f.startswith("website_platform:")
    ]

    if not website:
        details["flags"] = flags
        return

    # Determine identity type
    identity_type = classify_identity_type(identity)

    # Add new website flags
    flags.append(f"website via={identity_type}")

    # Add platform detail for non-employer domains
    if identity_type not in {"employer_owned", "unknown", "invalid"}:
        platform = extract_platform(identity)
        if platform and platform != "unknown":
            flags.append(f"website_platform:{platform}")

    details["flags"] = flags


def _attach_org_language(
    row: dict,
    llm_public_language: str | None = None,
    force_lang: bool = False,
    fetch_web: bool = False,
) -> dict:
    """Set organizations.language from name/website signals, else public_language.

    Does not overwrite an already-populated language value unless *force_lang*
    is True. Objective signals (website metadata + name LLM) win;
    ``llm_public_language`` is a soft, research-derived model judgment used
    only as a tiebreaker when those are silent.

    Website fetching is off by default (insert/reassess stay offline); pass
    ``fetch_web=True`` from throttled backfills that intentionally probe sites.

    Always records provenance on ``sse_details.flags`` (``language:… via=…``
    and optional ``language_reason:…``), including when language is kept.
    """
    existing = row.get("language")
    if existing and not force_lang:
        _append_language_provenance_flags(
            row,
            language=str(existing),
            via="kept",
        )
        return row

    classification = classify_org_language(
        name=row.get("name"),
        website=row.get("website"),
        fetch_web=fetch_web,
    )
    lang = classification.language

    # An English name is a weak signal: English is a lingua franca in Canada, and
    # many French/bilingual orgs carry an English or language-neutral legal name.
    # A research-grounded public_language of fr/bilingual overrides a name-only
    # English guess. French/bilingual names and confirmed website evidence stay
    # authoritative.
    name_only_english = classification.source == "llm_name" and lang == "en"
    if llm_public_language in VALID_ORG_LANGUAGES and (
        lang is None or (name_only_english and llm_public_language != "en")
    ):
        row["language"] = llm_public_language
        _append_language_provenance_flags(
            row,
            language=llm_public_language,
            via="public_language",
            reasons=classification.reasons,
        )
        return row

    if lang:
        row["language"] = lang
        _append_language_provenance_flags(
            row,
            language=lang,
            via=classification.source,
            reasons=classification.reasons,
        )
        return row

    _append_language_provenance_flags(
        row,
        language=None,
        via=classification.source or "unknown",
        reasons=classification.reasons or ("insufficient_signal",),
    )
    return row


def _result_to_db_fields(result: AssessedOrgResult) -> dict:
    description_en = result["description_en"]
    description_fr = result["description_fr"]
    mission_en = result["mission_statement_en"]
    mission_fr = result["mission_statement_fr"]
    reasoning_en = result["sse_reasoning_en"]
    reasoning_fr = result["sse_reasoning_fr"]
    website = result.get("website")
    fields = {
        "description_en": description_en,
        "description_fr": description_fr,
        # Legacy columns: prefer English, else French, for search/compat readers.
        "description": description_en or description_fr,
        "mission_statement_en": mission_en,
        "mission_statement_fr": mission_fr,
        "mission_statement": mission_en or mission_fr,
        "type": result["type"],
        "sector_id": result["sector_id"],
        "values": result["values_raw"],
        "values_list": result["values"],
        "values_rated": [{"value": v, "rank": i + 1} for i, v in enumerate(result["values"])] if result["values"] else None,
        "sse_rating": result["sse_rating"],
        "is_sse": result["sse_rating"] in ("strong_yes", "weak_yes"),
        "sse_details": {
            "confidence": result["sse_confidence"],
            "reasoning": reasoning_en or reasoning_fr,
            "reasoning_en": reasoning_en,
            "reasoning_fr": reasoning_fr,
            "must_haves_met": result["must_haves_met"],
            "nice_to_haves_met": result["nice_to_haves_met"],
            "flags": result["flags"],
            "classified_at": datetime.now(timezone.utc).isoformat(),
            "reviewed": False,
        },
    }
    # Persist employer-owned sites from assessor (+ known-website guard). Omitting
    # this field made re-assess / parity harnesses report website=None even when
    # Known website and Tavily evidence were available.
    if website and evidence_domain(website):
        fields["website"] = website
    return fields


_BILINGUAL_TEXT_KEYS = (
    "description_en",
    "description_fr",
    "mission_statement_en",
    "mission_statement_fr",
)


def _omit_null_locale_fields_from_update(updates: dict) -> dict:
    """Drop null bilingual columns so reassess does not wipe existing locale text."""
    out = {
        key: value
        for key, value in updates.items()
        if not (key in _BILINGUAL_TEXT_KEYS and value is None)
    }
    # Legacy search columns: only rewrite when at least one locale is present.
    if "description_en" in out or "description_fr" in out:
        legacy = out.get("description_en") or out.get("description_fr")
        if legacy:
            out["description"] = legacy
        else:
            out.pop("description", None)
    else:
        out.pop("description", None)

    if "mission_statement_en" in out or "mission_statement_fr" in out:
        legacy = out.get("mission_statement_en") or out.get("mission_statement_fr")
        if legacy:
            out["mission_statement"] = legacy
        else:
            out.pop("mission_statement", None)
    else:
        out.pop("mission_statement", None)
    return out


def _merge_sse_details_preserving_reasoning(
    updates: dict,
    previous_details: Any,
) -> dict:
    """Keep prior reasoning_* when the new assessor result left a locale blank."""
    details = updates.get("sse_details")
    if not isinstance(details, dict):
        return updates
    prev = previous_details if isinstance(previous_details, dict) else {}
    merged = dict(details)
    for key in ("reasoning_en", "reasoning_fr", "reasoning"):
        new_val = merged.get(key)
        old_val = prev.get(key)
        if (not isinstance(new_val, str) or not new_val.strip()) and isinstance(old_val, str) and old_val.strip():
            merged[key] = old_val
    merged["reasoning"] = (
        (merged.get("reasoning_en") if isinstance(merged.get("reasoning_en"), str) else None)
        or (merged.get("reasoning_fr") if isinstance(merged.get("reasoning_fr"), str) else None)
        or (merged.get("reasoning") if isinstance(merged.get("reasoning"), str) else None)
    )
    return {**updates, "sse_details": merged}


_ASSESSOR_SYSTEM = (
    "You are an expert at identifying organizations, finding their "
    "official employer-owned website, mapping work values, and "
    "evaluating Solidarity Economy alignment of the ORGANIZATION "
    "(not job-posting completeness). "
    "Interpretive fields (is_sse, sector, language, type, mission, values, website) "
    "must come from official-website / supporting web research — never from a stored "
    "or listing SOURCE DESCRIPTION. SOURCE DESCRIPTION is only for description_* "
    "when present. Do not replace the named organization with a different org from search. "
    "Org must_haves_met / nice_to_haves_met use only organization SSE criteria — "
    "never Transparent compensation, Clear job expectations, or other job-ad must-haves."
)

# Job-level must-have phrases that must never appear on org assessments.
_JOB_LEAKED_CRITERION_RE = re.compile(
    r"transparent\s+compensation|clear\s+job\s+expectations|"
    r"salary\s+disclosure|job\s+expectation|compensation\s+or\s+role\s+type|"
    r"unpaid\s+trial|volunteer\s+opportunity\s+disclosed",
    re.IGNORECASE,
)


def _strip_job_leaked_criterion_labels(labels: list[str]) -> list[str]:
    """Drop job-posting must-haves that models sometimes copy onto org assessments."""
    kept: list[str] = []
    for label in labels:
        if _JOB_LEAKED_CRITERION_RE.search(label):
            logger.info(
                "OrganizationAssessor: stripping job-leaked criterion label %r",
                label,
            )
            continue
        kept.append(label)
    return kept



class OrganizationAssessor(BaseGroundedClassifier):
    """Single grounded LLM call: identifies org, maps values, produces SSE rating."""

    def __init__(self) -> None:
        self.provider = get_sse_provider()
        if not self.provider:
            raise SSEClassificationError(
                "SSE provider not available for OrganizationAssessor. "
                "Check API keys (GEMINI_API_KEY, GROQ_API_KEY, TAVILY_API_KEY)."
            )

    def assess(
        self,
        raw_name: str,
        municipality: str | None = None,
        province: str | None = None,
        job_title: str = "",
        description: str = "",
        known_website: str | None = None,
        *,
        existing_description: str | None = None,
        listing_notes: str | None = None,
        web_evidence: str | None = None,
    ) -> AssessedOrgResult | None:
        # Early rejection: private residences are not organizations
        if raw_name and "private residence" in raw_name.lower():
            logger.warning(
                "OrganizationAssessor: rejecting 'private residence' - not an organization. Name: %r",
                raw_name
            )
            return None

        notes = listing_notes if listing_notes is not None else description
        # SOURCE DESCRIPTION = stored org/job about-text for description_* only.
        # Listing notes (legacy `description` arg) are identity hints — not SOURCE DESCRIPTION.
        source = existing_description if existing_description is not None else ""
        prompt = _build_assessment_prompt(
            raw_name,
            municipality,
            province,
            job_title,
            description=description,
            known_website=known_website,
            existing_description=source,
            listing_notes=notes,
        )
        prefetched = (web_evidence or "").strip()
        if prefetched:
            from llm.tavily_grounding import inject_grounding_evidence

            prompt = inject_grounding_evidence(prompt, prefetched)

        search_query = _build_search_query(
            raw_name, municipality, province, known_website=None,  # Don't bias search with potentially wrong website
        )
        prefer_hosts = None
        # Don't use known_website to bias Tavily - let it find the best match based on name+location
        # if known_website and evidence_domain(known_website):
        #     host = extract_domain(known_website)
        #     prefer_hosts = [host] if host else None
        from llm.tavily_grounding import entity_require_terms

        require_terms = entity_require_terms(raw_name) or None
        # Prefetched website scrape replaces Tavily. SOURCE DESCRIPTION does NOT
        # suppress research — interpretive fields need web evidence; description_*
        # fill-from-search is gated in the prompt only.
        use_grounding = not prefetched

        try:
            response_text = self._call_provider_with_retry(
                provider=self.provider,
                prompt=prompt,
                system=_ASSESSOR_SYSTEM,
                task="sse",
                search_query=search_query if use_grounding else None,
                retries=1,
                prefer_hosts=prefer_hosts if use_grounding else None,
                require_terms=require_terms if use_grounding else None,
                use_grounding=use_grounding,
            )
        except (SSEClassificationError, LLMProviderError) as exc:
            logger.warning(
                "OrganizationAssessor LLM call failed for %r: %s",
                raw_name, exc,
            )
            return None

        # Grounding sometimes silently fails, returning HTTP 200 with empty text.
        # Retry once without grounding as a fallback.
        if not response_text.strip():
            logger.warning(
                "OrganizationAssessor: empty response for %r — retrying without grounding",
                raw_name,
            )
            try:
                response_text = self._call_provider_with_retry(
                    provider=self.provider,
                    prompt=prompt,
                    system=_ASSESSOR_SYSTEM,
                    task="sse",
                    search_query=None,
                    retries=1,
                    use_grounding=False,
                )
            except (SSEClassificationError, LLMProviderError) as exc:
                logger.warning(
                    "OrganizationAssessor LLM retry (no grounding) failed for %r: %s",
                    raw_name, exc,
                )
                return None

        result = _parse_response(response_text, raw_name)
        if result is None:
            return None

        # Location validation: when we used grounding, validate that the discovered content
        # matches the expected location and name (regardless of whether we have a known_website)
        # Accept non-official sites as long as both name AND location match together
        if use_grounding:
            discovered_website = result.get("website")
            if discovered_website and evidence_domain(discovered_website):
                # Build location terms to check
                location_terms = []
                if municipality:
                    # Add municipality terms (e.g., "Oxford County" -> ["oxford", "county"])
                    location_terms.extend([t.lower() for t in municipality.split() if len(t) > 2])
                if province:
                    # Add province terms and abbreviations
                    location_terms.extend([province.lower(), province.upper()])
                    # Add common province name variations
                    province_map = {
                        "ON": ["ontario"],
                        "QC": ["quebec", "québec"],
                        "BC": ["british columbia"],
                        "AB": ["alberta"],
                        # Add more as needed
                    }
                    if province.upper() in province_map:
                        location_terms.extend(province_map[province.upper()])

                # If we have location info, validate it appears in the response
                # UNLESS the organization has national/provincial/international scope
                # We need at least 2 location term matches to avoid false positives from incidental mentions
                if location_terms:
                    # Check response_text and result fields for location terms
                    searchable_content = " ".join([
                        response_text.lower(),
                        result.get("description_en", "").lower(),
                        result.get("description_fr", "").lower(),
                        result.get("mission_statement_en", "").lower() if result.get("mission_statement_en") else "",
                        result.get("mission_statement_fr", "").lower() if result.get("mission_statement_fr") else "",
                        str(result.get("values_en", [])).lower() if result.get("values_en") else "",
                        str(result.get("values_fr", [])).lower() if result.get("values_fr") else "",
                    ])

                    # Count how many location terms match
                    matches = [term for term in location_terms if term in searchable_content]

                    # Check if location appears in the organization name itself
                    raw_name_lower = raw_name.lower()
                    location_in_name = any(term in raw_name_lower for term in location_terms if len(term) > 2)

                    # Also check if org name contains district/neighborhood indicators (often means local to that city)
                    # Common French and English district/neighborhood terms
                    district_indicators = [
                        'centre-', 'nord', 'sud', 'est', 'ouest', '-nord', '-sud', '-est', '-ouest',  # French directions (with/without hyphen)
                        'north', 'south', 'east', 'west', 'downtown', 'uptown',  # English directions
                        'rosemont', 'plateau', 'verdun', 'villeray', 'hochelaga', 'petite-patrie', 'ahuntsic',  # Montreal neighborhoods
                        'scarborough', 'etobicoke', 'north york', 'east york',  # Toronto districts
                    ]
                    has_district_name = any(indicator in raw_name_lower for indicator in district_indicators)

                    # Check geographic scope - relax location matching for broader scope organizations
                    scope = result.get("geographic_scope", "").lower()
                    is_broad_scope = scope in ("national", "provincial", "international")

                    # Require at least 2 distinct location term matches (or all terms if less than 2)
                    # UNLESS:
                    # - the organization has national/provincial/international scope, OR
                    # - the location appears in the organization name itself (reduces need for repetition), OR
                    # - the org name suggests a district/neighborhood (e.g., "Centre-Nord" for Montreal), OR
                    # - we found at least 1 match and grounding was used (Tavily validated the org)
                    required_matches = min(2, len(location_terms))

                    # Special case: if grounding was used and we have NO location matches,
                    # it likely means the org's website doesn't mention location explicitly
                    # but Tavily found it anyway. Trust the grounding result.
                    if use_grounding and len(matches) == 0:
                        location_found = True
                        logger.debug(
                            "OrganizationAssessor: accepting %r with 0 location matches - grounding (Tavily) provides validated location data",
                            raw_name
                        )
                    # If location is in name, has district indicator, OR grounding was used, accept with just 1 match
                    elif (location_in_name or has_district_name or use_grounding) and len(matches) >= 1:
                        location_found = True
                    else:
                        location_found = len(matches) >= required_matches

                    if not location_found and not is_broad_scope:
                        # Location mismatch - reject this result
                        logger.warning(
                            "OrganizationAssessor: location mismatch for %r - expected %s but found only %d/%d location terms: %s. Skipping.",
                            raw_name,
                            f"{municipality}, {province}" if municipality and province else municipality or province,
                            len(matches),
                            len(location_terms),
                            matches,
                        )
                        return None
                    elif not location_found and is_broad_scope:
                        # Accept broader-scope organizations even without local location match
                        logger.info(
                            "OrganizationAssessor: accepting %r despite location mismatch - geographic_scope=%s indicates broader reach",
                            raw_name, scope,
                        )
                    elif (location_in_name or has_district_name) and len(matches) >= 1:
                        # Accepted with reduced requirement because location is in name or has district indicator
                        logger.debug(
                            "OrganizationAssessor: accepting %r with %d/%d location matches - location in org name or district indicator reduces validation requirement",
                            raw_name, len(matches), len(location_terms),
                        )

                # Also validate name appears in domain (but be forgiving about exact match)
                # Skip this check if we have a known_website (trust the known website)
                # OR if there's no location data (can't cross-validate name+location)
                if not known_website and (municipality or province):
                    discovered_domain = extract_domain(discovered_website) or ""
                    domain_lower = discovered_domain.lower().replace("-", "").replace(".", "").replace("_", "")

                    # Normalize Unicode characters for comparison (accents, etc.)
                    import unicodedata
                    def normalize_text(text):
                        """Remove accents and normalize Unicode characters."""
                        # Decompose characters (é -> e + accent)
                        nfd = unicodedata.normalize('NFD', text)
                        # Filter out combining characters (accents)
                        return ''.join(c for c in nfd if not unicodedata.combining(c))

                    raw_name_normalized = normalize_text(raw_name.lower())
                    domain_normalized = normalize_text(domain_lower)

                    # Extract significant name parts (skip common words like "the", "and", etc.)
                    # Include common French articles and prepositions
                    skip_words = {
                        "the", "and", "or", "of", "for", "inc", "ltd", "corp", "company", "family", "companies",
                        "de", "la", "le", "les", "des", "du", "aux", "un", "une", "et", "d",  # French
                    }
                    # Split on spaces and remove all punctuation except apostrophes (handle those separately)
                    import string
                    name_parts = []
                    for p in raw_name.lower().split():
                        # Remove all punctuation except apostrophes
                        cleaned = p.translate(str.maketrans('', '', string.punctuation.replace("'", "").replace("'", "")))
                        # Now handle apostrophes
                        cleaned = normalize_text(cleaned.replace("'", "").replace("'", "").replace("-", ""))
                        if len(cleaned) > 1 and cleaned.lower() not in skip_words:
                            name_parts.append(cleaned)

                    # Check for acronyms in parentheses (e.g., "Find an Independent Mining Expert (FAIME)")
                    import re
                    acronym_match = re.search(r'\(([A-Z]{2,})\)', raw_name)
                    org_acronym = acronym_match.group(1).lower() if acronym_match else None

                    # Also check for ALL-CAPS words in the name (likely acronyms like "MSRK", "IBM", etc.)
                    all_caps_words = re.findall(r'\b[A-Z]{2,}\b', raw_name)
                    all_caps_acronyms = [word.lower() for word in all_caps_words] if all_caps_words else []

                    # Check if at least one significant name part appears in domain
                    # OR if domain contains initials/acronym of the organization name
                    name_match = False
                    if name_parts:
                        # Check first 1-3 significant words from org name (partial match on longer words OK)
                        for part in name_parts[:3]:
                            part_clean = part.replace("'", "").replace("'", "")
                            # Accept if part is in domain, OR if domain contains first 3+ chars of longer word
                            # Also handle numbers (like "7" in "batiment7")
                            if part_clean in domain_normalized or (len(part_clean) >= 6 and part_clean[:4] in domain_normalized):
                                name_match = True
                                logger.debug(
                                    "OrganizationAssessor: accepting %r - domain %s contains word '%s'",
                                    raw_name, discovered_domain, part_clean
                                )
                                break

                        # Also check if domain contains a concatenation of multiple words from name
                        # This catches "lalternativesantementale" from "L'Alternative... santé mentale"
                        if not name_match and len(name_parts) >= 2:
                            # Try pairs and triples of consecutive words
                            for i in range(len(name_parts)):
                                for j in range(i+2, min(i+4, len(name_parts)+1)):
                                    concat = ''.join(name_parts[i:j])
                                    if len(concat) >= 8 and concat in domain_normalized:
                                        name_match = True
                                        logger.debug(
                                            "OrganizationAssessor: accepting %r - domain %s contains concatenated words '%s'",
                                            raw_name, discovered_domain, concat
                                        )
                                        break
                                if name_match:
                                    break

                        # Also check with hyphens preserved (for domains like "lalternative-cdj")
                        # Get the original domain with hyphens but lowercase
                        if not name_match:
                            domain_with_hyphens = discovered_domain.lower().replace(".", "").replace("_", "")
                            for part in name_parts[:5]:  # Check more parts
                                part_clean = part.replace("'", "").replace("'", "")
                                if len(part_clean) >= 4 and part_clean in domain_with_hyphens:
                                    name_match = True
                                    logger.debug(
                                        "OrganizationAssessor: accepting %r - domain %s (with hyphens) contains word '%s'",
                                        raw_name, discovered_domain, part_clean
                                    )
                                    break

                        # If no word match, check if domain contains stated acronym OR all-caps words
                        if not name_match and (org_acronym or all_caps_acronyms):
                            # Check parenthesized acronym
                            if org_acronym and org_acronym in domain_normalized:
                                name_match = True
                                logger.debug(
                                    "OrganizationAssessor: accepting %r - domain %s contains acronym '%s'",
                                    raw_name, discovered_domain, org_acronym
                                )
                            # Check ALL-CAPS words (like "MSRK", "IBM")
                            if not name_match:
                                for caps_word in all_caps_acronyms:
                                    if caps_word in domain_normalized:
                                        name_match = True
                                        logger.debug(
                                            "OrganizationAssessor: accepting %r - domain %s contains all-caps acronym '%s'",
                                            raw_name, discovered_domain, caps_word
                                        )
                                        break

                        # If no word match, check if domain contains initials from ALL significant words
                        if not name_match and len(name_parts) >= 2:
                            # Build initials from first letter of each significant word
                            initials = ''.join(p[0] for p in name_parts[:5])  # Up to 5 words
                            if len(initials) >= 2 and initials in domain_normalized:
                                name_match = True
                                logger.debug(
                                    "OrganizationAssessor: accepting %r - domain %s contains initials '%s'",
                                    raw_name, discovered_domain, initials
                                )
                            # Also check if first 2-3 initials appear at START of domain (common for abbreviated domains)
                            elif len(initials) >= 2:
                                for length in [3, 2]:  # Try 3 letters first, then 2
                                    if len(initials) >= length and domain_normalized.startswith(initials[:length]):
                                        name_match = True
                                        logger.debug(
                                            "OrganizationAssessor: accepting %r - domain %s starts with initials '%s'",
                                            raw_name, discovered_domain, initials[:length]
                                        )
                                        break

                        # If still no match, try first word of each "phrase" separated by special chars
                        # This catches cases like "Carrefour d'aide" -> "CCR" (Carrefour Centre something)
                        if not name_match:
                            # Get all words from original name, including those with apostrophes/dashes
                            all_words = re.findall(r'\b[A-Za-zÀ-ÿ]+\b', raw_name)  # Include accented characters
                            # Normalize and filter out skip words but include ALL remaining words for initials
                            significant_words = [
                                normalize_text(w) for w in all_words
                                if normalize_text(w.lower()) not in skip_words and len(w) > 1
                            ]
                            if len(significant_words) >= 2:
                                # Try various initial combinations
                                full_initials = ''.join(w[0].lower() for w in significant_words[:6])
                                # Check if ANY substring of 3+ initials appears in domain
                                for i in range(len(full_initials) - 2):
                                    substring = full_initials[i:i+3]
                                    if substring in domain_normalized:
                                        name_match = True
                                        logger.debug(
                                            "OrganizationAssessor: accepting %r - domain %s contains initial sequence '%s'",
                                            raw_name, discovered_domain, substring
                                        )
                                        break

                                # Also check if first 2-3 letters START the domain
                                if not name_match and len(full_initials) >= 2:
                                    for length in [3, 2]:
                                        if len(full_initials) >= length and domain_normalized.startswith(full_initials[:length]):
                                            name_match = True
                                            logger.debug(
                                                "OrganizationAssessor: accepting %r - domain %s starts with initial sequence '%s'",
                                                raw_name, discovered_domain, full_initials[:length]
                                            )
                                            break

                                # For French orgs, also try with first letter of EACH word (including d', l', etc.)
                                # Split on apostrophes and spaces to get ALL tokens
                                if not name_match:
                                    all_tokens = re.split(r"[\s']+", raw_name_normalized)
                                    token_initials = ''.join(t[0] for t in all_tokens if len(t) > 0)[:6]
                                    if len(token_initials) >= 3:
                                        # Check if first 3 token initials START the domain
                                        if domain_normalized.startswith(token_initials[:3]):
                                            name_match = True
                                            logger.debug(
                                                "OrganizationAssessor: accepting %r - domain %s starts with token initials '%s'",
                                                raw_name, discovered_domain, token_initials[:3]
                                            )
                                        # Or if they appear anywhere in domain
                                        elif token_initials[:3] in domain_normalized:
                                            name_match = True
                                            logger.debug(
                                                "OrganizationAssessor: accepting %r - domain %s contains token initials '%s'",
                                                raw_name, discovered_domain, token_initials[:3]
                                            )
                    else:
                        # No significant name parts to check - accept it
                        name_match = True

                    if not name_match:
                        # Name doesn't match domain - check if location at least matches
                        # If location matches, we can still accept it (non-official site is OK)
                        if location_terms:
                            location_found_in_domain = any(term in discovered_domain.lower() for term in location_terms)
                            if location_found_in_domain:
                                # Location in domain compensates for name mismatch
                                logger.info(
                                    "OrganizationAssessor: accepting %r despite name mismatch - location found in domain %s",
                                    raw_name, discovered_domain,
                                )
                            else:
                                # Neither name nor location match - reject
                                logger.warning(
                                    "OrganizationAssessor: name and location mismatch for %r - domain %s doesn't match. Skipping.",
                                    raw_name, discovered_domain,
                                )
                                return None
                        else:
                            # No location to validate, only name mismatch - reject
                            logger.warning(
                                "OrganizationAssessor: name mismatch for %r - domain %s doesn't contain org name. Skipping.",
                                raw_name, discovered_domain,
                            )
                            return None

        result = _apply_website_known_guard(result, known_website)

        # Add model used to flags for auditing
        if hasattr(self.provider, 'current_model'):
            model_used = self.provider.current_model
            if model_used and model_used != "none":
                flags = list(result.get("flags") or [])
                flags.append(f"model:{model_used}")
                result = AssessedOrgResult(**{**result, "flags": flags})

        return self._ensure_length_limits(result, raw_name)

    def _ensure_length_limits(
        self,
        result: AssessedOrgResult,
        raw_name: str,
    ) -> AssessedOrgResult:
        """Truncate any over-limit fields to avoid breaking DB bounds."""
        oversize = _fields_over_limit(result)
        if not oversize:
            return result

        logger.info(
            "OrganizationAssessor: truncating over-limit fields for %r: %s",
            raw_name,
            {field: f"{len(text)} > {max_chars}" for field, (text, max_chars) in oversize.items()},
        )

        updates: dict[str, Any] = {}
        flags = list(result.get("flags") or [])
        for field, (original, max_chars) in oversize.items():
            updates[field] = _smart_truncate(original, max_chars)
            flags.append(f"length_limit: truncated {field}")

        return AssessedOrgResult(**{**result, **updates, "flags": flags})

    def assess_and_build_row(
        self,
        raw_name: str,
        municipality: str | None = None,
        province: str | None = None,
        job_title: str = "",
        description: str = "",
        canonical_loc: str = "",
        known_website: str | None = None,
        fetch_web: bool = False,
    ) -> dict | None:
        """Assess the org and return a row dict ready for DB insert.

        Returns None if the LLM call fails (caller should use minimal fallback).
        """
        result = self.assess(
            raw_name,
            municipality,
            province,
            job_title,
            description="",
            known_website=known_website,
            listing_notes=description,
            existing_description="",
        )
        if result is None:
            return None

        loc_str = canonical_loc or None
        # parse_address_with_geocodio always returns a complete dict (municipality, province,
        # lat, lng, geocode_accuracy_type); it handles None/empty internally.
        geo_data = parse_address_with_geocodio(loc_str)

        # Build the row with all fields
        row = {
            "name": result["canonical_name"],
            "slug": result["slug"],
            "location": loc_str,
            "website": result["website"],
            "municipality": geo_data.get("municipality"),
            "province": geo_data.get("province"),
            "lat": geo_data.get("lat"),
            "lng": geo_data.get("lng"),
            "geocode_accuracy_type": geo_data.get("geocode_accuracy_type"),
            **_result_to_db_fields(result),
        }

        # Add website identity provenance flags if website exists
        website = result.get("website")
        if website:
            from utils.organization_cache import extract_org_identity

            identity = extract_org_identity(website)
            # Only add flags if identity was successfully extracted
            if identity:
                _append_website_identity_flags(row, website, identity)

        return _attach_org_language(
            row,
            result.get("public_language"),
            fetch_web=fetch_web,
        )

    def assess_and_build_update(
        self,
        org: dict,
        force_lang: bool = False,
        fetch_web: bool = False,
    ) -> dict | None:
        """Re-assess an existing org and return an update dict.

        Includes website when the assessor returns an employer-owned host.
        Passes the org's current website (if evidence-grade) into search/prompt.
        """
        name = org.get("name")
        if not name:
            logger.warning(
                "assess_and_build_update: org_id=%s has no name, skipping", org.get("id"),
            )
            return None
        known_website = org.get("website")
        existing = (
            org.get("description_en")
            or org.get("description_fr")
            or org.get("description")
            or ""
        )
        # Stored description is SOURCE DESCRIPTION for description_* only (prompt-gated).
        # It does not disable Tavily; interpretive fields still use web research.
        result = self.assess(
            raw_name=name,
            municipality=org.get("municipality"),
            province=org.get("province"),
            job_title="",
            description="",
            known_website=known_website,
            existing_description=existing,
            listing_notes="",
        )
        if result is None:
            return None

        updates = _result_to_db_fields(result)
        updates = _omit_null_locale_fields_from_update(updates)
        updates = _merge_sse_details_preserving_reasoning(updates, org.get("sse_details"))
        website = result.get("website")
        # Accept ANY website returned by LLM (location validation already done)
        if website:
            from utils.organization_cache import extract_org_identity

            # Extract identity for uniqueness matching and flag tracking
            identity = extract_org_identity(website)

            # Only add flags if identity was successfully extracted
            if identity:
                _append_website_identity_flags(updates, website, identity)

            updates["website"] = website
        return _attach_org_language(
            {
                "name": name,
                "language": org.get("language"),
                **updates,
                "description": updates.get("description") or org.get("description"),
                "mission_statement": (
                    updates.get("mission_statement") or org.get("mission_statement")
                ),
                "website": updates.get("website") or org.get("website"),
            },
            result.get("public_language"),
            force_lang=force_lang,
            fetch_web=fetch_web,
        )
