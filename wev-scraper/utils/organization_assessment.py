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
from utils.organization_cache import domains_match, evidence_domain, extract_domain
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
  "description_en": "Organization description in English (strictly under 400 chars / ~45 words — EXTRACT-FIRST: copy or minimally paraphrase source wording when present; preserve key nouns/phrasing. Record provenance in flags as 'description via=extracted|inferred|absent'), or null",
  "description_fr": "Same description in French (strictly under 400 chars / ~45 words — translate accurately if not present in French on source; do not casually drop a locale when both EN and FR are evidenced), or null",
  "mission_statement_en": "Organization mission/purpose in English (strictly under 400 chars / ~45 words — EXTRACT-FIRST: copy or minimally paraphrase source wording when present; preserve key nouns/phrasing. Record provenance in flags as 'mission via=extracted|inferred|absent'), or null",
  "mission_statement_fr": "Same mission/purpose in French (strictly under 400 chars / ~45 words — translate accurately if not present in French on source; do not casually drop a locale when both EN and FR are evidenced), or null",
  "type": "One of: nonprofit, cooperative, government, union, other — or null ONLY when research is too thin to choose. IMPORTANT: Decide type BEFORE sse_rating. Classify based on governance control and ownership, not mission language alone. Type is a filter, not a Yes by itself — SSE Yes still requires must-haves from research. FORBIDDEN: strong_yes/weak_yes with type null. If nonprofit/coop/union is not evidenced, prefer 'other' (not null). If an entity is created by government statute, has its governing body appointed by government (a minister, cabinet, or a public authority), and its mandate is set externally by government rather than by an autonomous membership, classify it as 'government', regardless of whether it is incorporated as a nonprofit. Reserve 'nonprofit' for organizations autonomously governed as charities/nonprofits (independent board, non-distribution) — map mutuals/community groups to nonprofit; board+ED charities stay nonprofit (never 'other' for lacking cooperative labels). Use 'cooperative' for worker/consumer/producer coops and credit unions. Use 'other' for conventional for-profits, privately owned mission-driven businesses (including private nature/forest schools), and political parties / electoral organizations (parties are NOT 'government'). Do NOT invent a social-enterprise type.",
  "sector_id": "Sector ID from the ALLOWED SECTORS list below, or null if none fit well",
  "sector_hint": "Alias for sector_id (code maps through allowlist — do not invent IDs)",
  "values_raw": "Organization values and principles if found on their website (strictly under 800 chars / ~100 words — EXTRACT-FIRST from source; minimal paraphrase. Record provenance in flags as 'values via=extracted|inferred|absent'), or null",
  "values": ["List of mapped Knowdell work values (see taxonomy below), max 5 values"],
  "sse_rating": "strong_yes or weak_yes or no — never Yes when type is null or ineligible",
  "sse_confidence": "0.0 to 1.0",
  "sse_reasoning_en": "2–3 concise English sentences citing the key evidence for the rating (strictly under 320 chars / ~35 words — paraphrase to fit completely). Do NOT restate must_haves_met or nice_to_haves_met — those belong only in their arrays",
  "sse_reasoning_fr": "Same reasoning in French (strictly under 320 chars / ~35 words — paraphrase to fit completely)",
  "must_haves_met": ["ONLY org must-have labels from ORG MUST-HAVES 1–3 below — never job/posting criteria"],
  "nice_to_haves_met": ["ONLY org nice-to-have labels from ORG NICE-TO-HAVES below — never job/posting criteria"],
  "flags": ["REQUIRED — see FLAGS RULES below"],
  "public_language": "Primary language of the organization's own public materials (website, postings, documents, reports) observed during research. Use only: en, fr, bilingual, or null. Do not use the language of this response as evidence. Prefer bilingual when the organization publishes substantial public materials in both English and French (or both EN and FR sites)."
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
  mission via=extracted|inferred|absent
  values via=extracted|inferred|absent

Use:
- via=extracted — closely taken/paraphrased from the org's own CONFIRMED website
  or official materials on that site. Do NOT use via=extracted when you only have
  LinkedIn / Glassdoor / news / directory snippets and no confirmed org website.
- via=inferred — you composed it from supporting secondary sources, or guessed
- via=absent — you returned null/empty for that field

Language provenance is added by code after your response (language:… via=… /
language_reason:…). Do not invent language flags yourself.

Also add when relevant:
- website_unavailable — site unreachable or had no useful content
- any other short concern labels

Most organizations do NOT explicitly publish a mission statement or values list —
prefer mission via=inferred / values via=inferred over claiming extracted."""

_BILINGUAL_COPY_RULES = """BILINGUAL PUBLIC COPY (required):
- Always provide BOTH English and French for description_*, mission_statement_*, and sse_reasoning_* when you have enough evidence to write the field at all.
- If you can write the English version, also write the French version (and vice versa) — do not leave one locale null when the other is present.
- When research evidences both EN and FR public materials, keep both locales populated — do not casually drop one language.
- COPY FIDELITY: when SOURCE DESCRIPTION or extracted website text is present, prefer extract-first / minimal paraphrase — preserve key nouns and phrasing; do not freely rewrite.
- Write natural French (not word-for-word calque) and natural English when translating a missing locale.
- Knowdell "values" labels stay in English (taxonomy keys). values_raw may stay in the source language of the website.
- must_haves_met / nice_to_haves_met / flags stay in English short labels.
- must_haves_met / nice_to_haves_met must follow ORG CRITERION LABEL RULES (org criteria only — never compensation)."""

_WEBSITE_RULES = """WEBSITE RULES for the "website" field:
- Prefer the organization's own official homepage (the domain they control).
- CRITICAL: Copy the website URL ONLY from SUPPORTING WEB EVIDENCE link hosts
  (or Known website). NEVER invent, guess, or fabricate a domain from the
  organization name (e.g. name.ca / name.org guesses are forbidden).
- If ORGANIZATION DATA lists a Known website, prefer that URL unless it violates
  the rules below (shared/ATS/social) — then discover a better employer-owned site
  that appears in the evidence URLs.
- Do NOT use job-board, ATS, or careers-platform URLs (e.g. Greenhouse, Lever,
  Workday, Indeed, CharityVillage, LinkedIn jobs).
- Do NOT use social profiles or link aggregators (Facebook, Instagram, LinkedIn
  company pages, Linktree, bit.ly) unless that is truly their only web presence
  — in that case return null instead (social hosts are not reliable identity).
- Do NOT use the scraped job listing URL.
- If Known website is "(none …)" / missing: return null unless an evidence URL
  clearly identifies the employer-owned homepage.
- If you cannot confidently identify the employer-owned site from evidence,
  return null — code will refuse unverified websites.
- LOCATION DISAMBIGUATION: the website MUST belong to the employer of THIS job
  in THIS municipality/province. Do NOT adopt a same-name org in another country
  or city (e.g. a US ``*.gov`` agency or US farm for a Canadian posting). Prefer
  evidence whose title/snippet mentions the same city/province. If only a
  foreign same-name entity appears, return website null.
- Prefer https:// and the apex/homepage over a deep job posting path."""

_ENTITY_LOCATION_RULES = """ENTITY / LOCATION DISAMBIGUATION (mandatory):
- You are assessing the employer of the job described in ORGANIZATION DATA
  (raw name + municipality/province + job title / listing notes).
- The assessed organization MUST be that employer in that location — not a
  differently located org that shares a similar name.
- When JOB LISTING PAGE EVIDENCE is present, identity on that listing is
  authoritative for the employer name. Trade names on the listing (e.g.
  operating-as / "Rembourrage Orford") may be used to search for an official
  website, but do NOT replace the employer with an unrelated local plant or
  same-city manufacturer found in web search (e.g. a Magog chemicals plant for
  a numbered Québec rembourreur corporation).
- Reject evidence that clearly places the entity in another country or distant
  city when ORGANIZATION DATA has a Canadian province (e.g. Ohio / Georgia /
  Atlanta for an ON or QC job).
- If web evidence only supports a same-name org elsewhere, return:
  website null, weak description/mission (or null), and weak_yes/no with flags
  noting insufficient / wrong-entity evidence — do NOT copy the foreign entity.
"""

_LISTING_EVIDENCE_HEADER = """JOB LISTING PAGE EVIDENCE (authoritative for employer identity):
- Prefer employer / trade-name identity from this page over city-level search noise.
- Trade names here may guide website search; do not adopt an unrelated org.

"""

# Québec enterprise registry — boost when assessing numbered QC corporations.
_QC_REGISTRE_HOST = "registreentreprises.gouv.qc.ca"

_PUBLIC_LANGUAGE_RULES = """PUBLIC_LANGUAGE RULES:
Priority for public_language (en | fr | bilingual | null) — page evidence first:
1. Actual public-facing website language in materials you observed (confirmed site)
2. Parallel locale trees / bilingual site structure: /en+/fr paths, hreflang pairs,
   bilingual nav, dual-language page trees, or clearly bilingual source text
3. Explicit website language metadata
4. Organization name ONLY as last-resort weak evidence when no website/listing/
   corpus language signal exists — never let the name override confirmed page
   language or bilingual site structure
- When a website was confirmed/fetched, decide language from that page evidence
  first. Do not collapse a bilingual site to fr or en merely because the legal
  name leans French or English.
- Verify name leaning against the organization's own materials you observed.
- Do not infer from the language of this JSON response.
- Return bilingual when materials show substantial English AND French
  (or an explicit bilingual claim) — including Canadian charities/foundations with
  an EN site plus FR pages, FR toggle, /fr/ paths, or French program materials in
  the research evidence. Prefer bilingual over en-only or fr-only in those cases.
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
- Do not pick community-civic-infrastructure merely because the work has public
  clients or "community" marketing language."""

_SOURCE_DESCRIPTION_RULES = """SOURCE DESCRIPTION vs INTERPRETIVE FIELDS (mandatory):
- is_sse / sse_rating, sector_id, public_language, type, website, mission_statement_*,
  and values MUST come from official-website / supporting web research only.
- PRIMARY vs SECONDARY sources:
  • Once a website is identified from evidence, prefer that site's content for
    description / mission / values (via=extracted only from that org site).
  • LinkedIn, Glassdoor, news articles, and directories are SUPPORTING context
    only — use them for SSE / identity disambiguation, not as if they were the
    org homepage. Do not claim via=extracted from secondary sources alone.
  • If no confirmed employer website is available, you may still assess SSE from
    secondaries, but leave website null and prefer via=inferred or via=absent
    for description / mission rather than inventing copy.
- NEVER use SOURCE DESCRIPTION (stored org blurb or job-listing body) to decide those
  interpretive fields — listing copy is often wrong, stale, or about a related brand.
- description_* only:
  • If SOURCE DESCRIPTION is present: extract/minimally paraphrase from it
    (flag description via=extracted). Preserve key nouns and phrasing — do not
    freely rewrite. Do NOT call on search snippets to replace it.
  • If SOURCE DESCRIPTION is absent: you may write description_* from web evidence
    (via=inferred or via=extracted from the confirmed org website only).
- mission_statement_* / values_raw: when official-site text is present, extract-first
  with minimal paraphrase; use via=inferred only when composing without a close source.
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

{entity_location_rules}

{bilingual_copy_rules}

{public_language_rules}

{flags_rules}

{length_limited_field_rules}

{JSON_INSTRUCTIONS}

ORGANIZATION DATA:
  Raw name:    {raw_name}
  Municipality: {municipality}
  Province:     {province}
  Known website: {known_website}
  Job title (identity hint only): {job_title}
  Listing URL (identity source when fetched): {listing_url}
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
    listing_url: str | None = None,
) -> str:
    """Build the single-shot org-assessor prompt.

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
    listing = (listing_url or "").strip() or "(none)"
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
        job_title=job_title or "(none)",
        listing_url=listing,
        listing_notes=notes_block,
        source_description=source_block,
        json_fields=_JSON_FIELDS,
        sector_taxonomy_formatted=get_formatted_sector_taxonomy(),
        taxonomy_formatted=_format_taxonomy(),
        website_rules=_WEBSITE_RULES,
        entity_location_rules=_ENTITY_LOCATION_RULES,
        bilingual_copy_rules=_BILINGUAL_COPY_RULES,
        public_language_rules=_PUBLIC_LANGUAGE_RULES,
        flags_rules=_FLAGS_RULES,
        sector_priority_rules=_SECTOR_PRIORITY_RULES,
        JSON_INSTRUCTIONS=JSON_INSTRUCTIONS,
        length_limited_field_rules=LENGTH_LIMITED_FIELD_RULES,
    )


# Map CA province codes → search-friendly full names (location-biased Tavily).
_CA_PROVINCE_SEARCH_NAME: dict[str, str] = {
    "AB": "Alberta",
    "BC": "British Columbia",
    "MB": "Manitoba",
    "NB": "New Brunswick",
    "NL": "Newfoundland",
    "NS": "Nova Scotia",
    "NT": "Northwest Territories",
    "NU": "Nunavut",
    "ON": "Ontario",
    "PE": "Prince Edward Island",
    "QC": "Quebec",
    "SK": "Saskatchewan",
    "YT": "Yukon",
}


def _build_search_query(
    raw_name: str,
    municipality: str | None = None,
    province: str | None = None,
    known_website: str | None = None,
    *,
    job_title: str | None = None,
) -> str:
    """Grounding query aimed at the employer's own site in the job location.

    Includes job title when present (disambiguates numbered Québec corps from
    city manufacturing noise) plus city + province so Tavily does not latch onto
    a same-name org in another country (Foxhole Ohio vs Rockwood ON).
    """
    from utils.location_parser import _normalize_ca_province_code
    from utils.website_verify import is_quebec_numbered_company

    parts = [f'"{raw_name}"']
    title = (job_title or "").strip()
    if title:
        parts.append(title)
    mun = (municipality or "").strip()
    if mun:
        parts.append(mun)
    prov_code = _normalize_ca_province_code(province)
    if prov_code:
        parts.append(_CA_PROVINCE_SEARCH_NAME.get(prov_code, prov_code))
        # Job-title queries already pin the role; skip redundant Canada noise.
        if not title:
            parts.append("Canada")
    elif province and str(province).strip():
        parts.append(str(province).strip())
    if is_quebec_numbered_company(raw_name):
        parts.append("registre")
        parts.append("NEQ")
    if not title:
        parts.append("official website")
    if known_website and evidence_domain(known_website):
        parts.append(known_website.strip())
    # Bias Tavily toward About / charity / governance pages over job/program noise.
    from utils.sse_prompts import SSE_SEARCH_KEYWORDS

    parts.append(SSE_SEARCH_KEYWORDS)
    query = " ".join(parts)
    # Tavily hard-caps query length at 400; drop keywords first, then trim.
    if len(query) > 400:
        without_kw = " ".join(parts[:-1])
        if len(without_kw) <= 400:
            query = without_kw
        else:
            query = without_kw[:397].rstrip() + "..."
    return query


def _prefer_hosts_for_assess(
    *,
    known_website: str | None = None,
    listing_url: str | None = None,
    raw_name: str | None = None,
) -> list[str] | None:
    """Hosts to rank first in Tavily (known site, listing board, QC registre)."""
    from utils.website_verify import is_quebec_numbered_company

    hosts: list[str] = []
    seen: set[str] = set()

    def _add(host: str | None) -> None:
        h = (host or "").strip().lower().lstrip(".")
        if h.startswith("www."):
            h = h[4:]
        if not h or h in seen:
            return
        seen.add(h)
        hosts.append(h)

    if known_website and evidence_domain(known_website):
        _add(extract_domain(known_website))
    if listing_url and str(listing_url).strip():
        _add(extract_domain(listing_url))
    if is_quebec_numbered_company(raw_name):
        _add(_QC_REGISTRE_HOST)
    return hosts or None


def _evidence_blob_for_url(
    evidence_results: list | None,
    candidate_url: str | None,
) -> str:
    """Concatenate Tavily title/content for hits on the same host as *candidate*."""
    from utils.website_verify import url_host

    host = url_host(candidate_url)
    if not host or not evidence_results:
        return ""
    pieces: list[str] = []
    for hit in evidence_results:
        if isinstance(hit, dict):
            url = hit.get("url")
            title = hit.get("title") or ""
            content = hit.get("content") or ""
        else:
            url = getattr(hit, "url", None)
            title = getattr(hit, "title", "") or ""
            content = getattr(hit, "content", "") or ""
        if url_host(url) and domains_match(host, url_host(url)):
            blob = f"{title}\n{content}".strip()
            if blob:
                pieces.append(blob)
    return "\n".join(pieces)


def _location_terms_for_tavily(
    municipality: str | None,
    province: str | None,
) -> list[str]:
    """Tokens used to boost Tavily hits that mention the job/org location."""
    from utils.location_parser import _normalize_ca_province_code

    terms: list[str] = []
    mun = (municipality or "").strip()
    if mun:
        terms.append(mun.lower())
    prov_code = _normalize_ca_province_code(province)
    if prov_code:
        terms.append(prov_code.lower())
        full = _CA_PROVINCE_SEARCH_NAME.get(prov_code)
        if full:
            terms.append(full.lower())
        terms.append("canada")
    elif province and str(province).strip():
        terms.append(str(province).strip().lower())
    # Stable unique
    return list(dict.fromkeys(t for t in terms if t))


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


# Known types that can never be SSE yes.
# Eligible stored types (must agree with ORG_EVALUATION_CRITERIA): nonprofit,
# cooperative, union. Eligible type is necessary but not sufficient — must-haves
# still apply; type alone is never a Yes. Null type with Yes is also demoted.
_SSE_INELIGIBLE_ORG_TYPES = frozenset({
    "government",
    "other",
})

# Reasoning that admits legal form / ownership status is unconfirmed → demote Yes.
_TYPE_STATUS_UNCONFIRMED_RE = re.compile(
    r"(?:"
    r"(?:nonprofit|non-profit|co-?operative|cooperative|union|charitable|charity|"
    r"legal\s+form|ownership|incorporation)\s+"
    r"(?:status\s+)?(?:is\s+|was\s+|remains?\s+)?"
    r"(?:not\s+(?:yet\s+)?confirmed|unconfirmed|unknown|unclear|uncertain|"
    r"could\s+not\s+(?:be\s+)?confirm(?:ed)?|not\s+evidenced)|"
    r"(?:not\s+(?:yet\s+)?confirmed|unconfirmed|unknown|unclear|uncertain|"
    r"could\s+not\s+(?:be\s+)?confirm(?:ed)?)\s+"
    r".{0,60}?(?:nonprofit|non-profit|co-?op(?:erative)?|union|charitable|"
    r"charity|legal\s+form|ownership)|"
    r"(?:no|without)\s+(?:explicit\s+)?(?:nonprofit|non-profit|co-?op|"
    r"cooperative|union)\s+status"
    r")",
    re.IGNORECASE | re.DOTALL,
)

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
    model omitted provenance for a populated field, default to via=inferred.
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
            status = "inferred" if present[field] else "absent"
        flags.append(f"{field} via={status}")

    if flags == original:
        return result
    return AssessedOrgResult(**{**result, "flags": flags})


def _apply_website_known_guard(
    result: AssessedOrgResult,
    known_website: str | None,
) -> AssessedOrgResult:
    """Prefer a known employer-owned website for cross-provider predictability.

    When Known website is evidence-grade, keep that URL (Gemini/Groq/Ollama often
    invent alternate hosts without grounding). Model-discovered sites are kept
    only when no known URL was provided. Downstream ``confirm_website`` still
    live-verifies before DB write.
    """
    known = known_website.strip() if known_website and evidence_domain(known_website) else None
    if not known:
        return result
    current = result.get("website")
    if current and extract_domain(current) == extract_domain(known):
        # Normalize to the known URL string when domains match.
        if current == known:
            return result
        return AssessedOrgResult(**{**result, "website": known})
    flags = list(result.get("flags") or [])
    if current and evidence_domain(current):
        flags.append(f"website_guard: preferred known over model ({current})")
    return AssessedOrgResult(**{**result, "website": known, "flags": flags})


def _confirm_result_website(
    result: AssessedOrgResult,
    *,
    evidence_urls: list[str],
    known_website: str | None,
    municipality: str | None = None,
    province: str | None = None,
    site_text: str | None = None,
    site_title: str | None = None,
    org_raw_name: str | None = None,
    evidence_snippet: str | None = None,
) -> AssessedOrgResult:
    """Null out website unless host is in Tavily evidence (or known) + live OK.

    Also rejects foreign ``*.gov`` for Canadian provinces, strong geographic
    conflicts, and pages missing significant org-name tokens. Wrong-entity
    rejects also clear description/mission/values copied from that entity.
    """
    from utils.website_verify import (
        confirm_website,
        has_geographic_conflict,
        is_foreign_gov_host,
        page_mentions_org_name,
    )

    candidate = result.get("website")
    known = known_website.strip() if known_website and str(known_website).strip() else None
    known_host_match = bool(
        candidate
        and known
        and extract_domain(candidate)
        and extract_domain(known)
        and extract_domain(candidate) == extract_domain(known)
    )
    name_mismatch = bool(
        candidate
        and org_raw_name
        and str(org_raw_name).strip()
        and not page_mentions_org_name(
            site_text,
            org_raw_name=org_raw_name,
            site_title=site_title,
            evidence_snippet=evidence_snippet,
        )
    )
    # Known employer URL: name-token miss alone must not wipe the site or cascade
    # into clearing description / flipping type downstream.
    hard_name_mismatch = name_mismatch and not known_host_match
    wrong_entity = bool(
        candidate
        and (
            is_foreign_gov_host(candidate, province=province)
            or has_geographic_conflict(
                site_text,
                municipality=municipality,
                province=province,
                site_title=site_title,
            )
            or hard_name_mismatch
        )
    )
    confirmed = confirm_website(
        candidate,
        evidence_urls=evidence_urls,
        known_website=known_website,
        municipality=municipality,
        province=province,
        site_text=site_text,
        site_title=site_title,
        org_raw_name=org_raw_name,
        evidence_snippet=evidence_snippet,
        relax_name_check=known_host_match,
    )
    if confirmed == candidate:
        return result
    flags = list(result.get("flags") or [])
    if candidate and not confirmed:
        flags.append("website_unconfirmed")
        if wrong_entity:
            flags.append("website_geo_conflict")
            logger.info(
                "website wrong-entity/geo conflict — clearing description/"
                "mission/values for %s",
                candidate,
            )
            return AssessedOrgResult(
                **{
                    **result,
                    "website": None,
                    "description_en": None,
                    "description_fr": None,
                    "mission_statement_en": None,
                    "mission_statement_fr": None,
                    "values_raw": None,
                    "flags": flags,
                }
            )
    return AssessedOrgResult(**{**result, "website": confirmed, "flags": flags})


def _apply_source_grounding(
    result: AssessedOrgResult,
    *,
    website_text: str = "",
    website_title: str = "",
    tavily_text: str = "",
    tavily_snippets: list[str] | None = None,
    source_description: str | None = None,
) -> AssessedOrgResult:
    """Hard-check description/mission/values against fetched sources."""
    from utils.source_grounding import build_grounding_corpora, ground_assessed_fields

    # Only treat site text as primary when website survived confirmation.
    has_site = bool(result.get("website"))
    corpora = build_grounding_corpora(
        website_text=website_text if has_site else "",
        website_title=website_title if has_site else "",
        tavily_snippets=tavily_snippets,
        tavily_text=tavily_text,
        source_description=source_description,
    )
    grounded = ground_assessed_fields(result, corpora)
    return AssessedOrgResult(**grounded)  # type: ignore[misc]


def _demote_extracted_without_confirmed_website(
    result: AssessedOrgResult,
) -> AssessedOrgResult:
    """Do not claim via=extracted when there is no confirmed org website."""
    if result.get("website"):
        return result
    original = list(result.get("flags") or [])
    flags: list[str] = []
    changed = False
    for raw in original:
        if not isinstance(raw, str):
            flags.append(raw)
            continue
        fl = raw.strip().lower()
        demoted = False
        for field in _CONTENT_PROVENANCE_FIELDS:
            if fl == f"{field} via=extracted":
                flags.append(f"{field} via=inferred")
                changed = True
                demoted = True
                break
        if not demoted:
            flags.append(raw)
    if not changed:
        return result
    return AssessedOrgResult(**{**result, "flags": flags})


def _apply_org_sse_governance_guard(result: AssessedOrgResult) -> AssessedOrgResult:
    """Force 'no' when type is missing/ineligible or reasoning admits unconfirmed form."""
    if result["sse_rating"] == "no":
        return result

    org_type = result.get("type")
    flags = list(result.get("flags") or [])

    if org_type is None:
        flags.append(
            "governance_gate: SSE yes requires an eligible org type "
            "(nonprofit, cooperative, or union) — null type cannot be SSE yes"
        )
        return AssessedOrgResult(
            **{
                **result,
                "sse_rating": "no",
                "flags": flags,
            }
        )

    if org_type in _SSE_INELIGIBLE_ORG_TYPES:
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

    reasoning_blob = " ".join(
        part
        for part in (
            result.get("sse_reasoning_en"),
            result.get("sse_reasoning_fr"),
        )
        if isinstance(part, str) and part.strip()
    )
    if reasoning_blob and _TYPE_STATUS_UNCONFIRMED_RE.search(reasoning_blob):
        flags.append(
            "governance_gate: demoted Yes — reasoning admits eligible legal "
            "form / governance status is unconfirmed or unknown"
        )
        return AssessedOrgResult(
            **{
                **result,
                "sse_rating": "no",
                "flags": flags,
            }
        )

    return result


def _normalize_sector_id(raw: Any) -> str | None:
    """Map sector_hint / sector_id through the allowlist (never freeform invent)."""
    if not raw:
        return None
    value = str(raw).strip()
    allowed = get_sector_ids_set()
    if value in allowed:
        return value
    key = value.lower().replace("_", "-").replace(" ", "-")
    return key if key in allowed else None


def _ensure_str_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        if item is None:
            continue
        text = str(item).strip()
        if text:
            out.append(text)
    return out


def _sse_provider_provenance(provider: Any) -> dict[str, str]:
    """Best-effort provider + model labels for sse_details."""
    if provider is None:
        return {}
    name: str | None = None
    model: str | None = None

    last = getattr(provider, "_last_successful", None)
    chain = getattr(provider, "_providers", None)
    if last and isinstance(chain, list):
        name = str(last)
        for chain_name, inner in chain:
            if chain_name == last:
                model = getattr(inner, "_model", None) or str(chain_name)
                break
        if model is None:
            model = str(last)
    else:
        name = getattr(provider, "_name", None)
        model = getattr(provider, "_model", None)
        if name is None:
            name = type(provider).__name__

    out: dict[str, str] = {}
    if name:
        out["provider"] = str(name)
    if model:
        out["model"] = str(model)
    return out


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
    """Keep only http(s) employer-owned sites; drop ATS/social/shared hosts."""
    if not raw:
        return None
    url = str(raw).strip()
    if not url:
        return None
    if "://" not in url:
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None
    if evidence_domain(url) is None:
        logger.info(
            "OrganizationAssessor: rejecting non-evidence website %r",
            url,
        )
        return None
    return url


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


def _loads_json_object(response_text: str, raw_name: str) -> dict | None:
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
    return data


def _parse_response(response_text: str, raw_name: str) -> AssessedOrgResult | None:
    """Parse a single-shot org assessment JSON payload."""
    data = _loads_json_object(response_text, raw_name)
    if data is None:
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
            "OrganizationAssessor: LLM returned no slug for canonical_name=%r "
            "raw_name=%r — generated slug=%r",
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
    sector_raw = data.get("sector_id", data.get("sector_hint"))
    result = AssessedOrgResult(
        canonical_name=canonical_name.strip(),
        slug=slug,
        website=_parse_website(data.get("website")),
        description_en=description_en,
        description_fr=description_fr,
        mission_statement_en=mission_en,
        mission_statement_fr=mission_fr,
        type=_normalize_type(data.get("type")),
        sector_id=_normalize_sector_id(sector_raw),
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
    )
    gated = _apply_org_sse_governance_guard(result)
    return _ensure_content_provenance_flags(gated)


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


def _attach_org_language(
    row: dict,
    llm_public_language: str | None = None,
    force_lang: bool = False,
    fetch_web: bool = False,
) -> dict:
    """Set organizations.language from website signals, else research, else name.

    Does not overwrite an already-populated language value unless *force_lang*
    is True.

    Precedence:
    1. Website evidence (``web_*`` sources from ``classify_org_language``)
    2. Research-grounded ``llm_public_language`` (assessor public_language)
    3. Name LLM (``via=llm_name``) — lowest priority; never overrides 1–2

    Website fetching is off by default (insert/reassess stay offline); pass
    ``fetch_web=True`` from throttled backfills that intentionally probe sites.
    When a confirmed website is present, prefer ``fetch_web=True`` so page
    evidence outranks the name LLM.

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

    # Prefer page evidence on force_lang reassess when a website is present.
    # Inserts stay offline unless callers pass fetch_web=True explicitly.
    effective_fetch = fetch_web or (
        force_lang and bool((row.get("website") or "").strip())
    )
    classification = classify_org_language(
        name=row.get("name"),
        website=row.get("website"),
        fetch_web=effective_fetch,
    )
    lang = classification.language
    source = classification.source or "unknown"
    web_source = source.startswith("web_")

    # Name LLM is never authoritative over research public_language.
    name_only = source == "llm_name"
    if llm_public_language in VALID_ORG_LANGUAGES and (
        lang is None or name_only
    ):
        row["language"] = llm_public_language
        _append_language_provenance_flags(
            row,
            language=llm_public_language,
            via="public_language",
            reasons=classification.reasons,
        )
        return row

    if lang and web_source:
        row["language"] = lang
        _append_language_provenance_flags(
            row,
            language=lang,
            via=source,
            reasons=classification.reasons,
        )
        return row

    if lang:
        row["language"] = lang
        _append_language_provenance_flags(
            row,
            language=lang,
            via=source,
            reasons=classification.reasons,
        )
        return row

    _append_language_provenance_flags(
        row,
        language=None,
        via=source,
        reasons=classification.reasons or ("insufficient_signal",),
    )
    return row


def _result_to_db_fields(
    result: AssessedOrgResult,
    *,
    provider: Any = None,
) -> dict:
    description_en = result["description_en"]
    description_fr = result["description_fr"]
    mission_en = result["mission_statement_en"]
    mission_fr = result["mission_statement_fr"]
    reasoning_en = result["sse_reasoning_en"]
    reasoning_fr = result["sse_reasoning_fr"]
    details: dict[str, Any] = {
        "confidence": result["sse_confidence"],
        "reasoning": reasoning_en or reasoning_fr,
        "reasoning_en": reasoning_en,
        "reasoning_fr": reasoning_fr,
        "must_haves_met": result["must_haves_met"],
        "nice_to_haves_met": result["nice_to_haves_met"],
        "flags": result["flags"],
        "classified_at": datetime.now(timezone.utc).isoformat(),
        "reviewed": False,
    }
    details.update(_sse_provider_provenance(provider))
    return {
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
        "sse_details": details,
    }


_BILINGUAL_TEXT_KEYS = (
    "description_en",
    "description_fr",
    "mission_statement_en",
    "mission_statement_fr",
)


def _omit_null_locale_fields_from_update(
    updates: dict,
    *,
    force_clear_ungrounded: bool = False,
) -> dict:
    """Drop null bilingual columns so reassess does not wipe existing locale text.

    When *force_clear_ungrounded* is True (geo conflict / grounding rejected all
    copy), keep explicit nulls so wrong-entity text is cleared from the DB.
    """
    if force_clear_ungrounded:
        out = dict(updates)
        # Ensure legacy columns are cleared alongside locale fields.
        if out.get("description_en") is None and out.get("description_fr") is None:
            out["description"] = None
        if (
            out.get("mission_statement_en") is None
            and out.get("mission_statement_fr") is None
        ):
            out["mission_statement"] = None
        return out

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


def _should_force_clear_copy(result: AssessedOrgResult) -> bool:
    """True when assessment intentionally nulled previously present copy."""
    flags = [f for f in (result.get("flags") or []) if isinstance(f, str)]
    if any("website_geo_conflict" in f for f in flags):
        return True
    if any(f.endswith("_ungrounded") for f in flags):
        return True
    return False


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
    "You assess organizations for Solidarity Economy alignment. "
    "Return JSON only. Prefer extract-first copy for description/mission/values. "
    "Never invent employer websites; copy URLs only from evidence. "
    "Never Yes when type is null — prefer other+no when legal form is unconfirmed."
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

    def _llm_complete(
        self,
        *,
        prompt: str,
        system: str,
        raw_name: str,
    ) -> str | None:
        """Call provider at temperature 0; retry once on empty text."""
        try:
            response_text = self._call_provider_with_retry(
                provider=self.provider,
                prompt=prompt,
                system=system,
                task="sse",
                search_query=None,
                retries=1,
                use_grounding=False,
                temperature=0,
            )
        except (SSEClassificationError, LLMProviderError) as exc:
            logger.warning(
                "OrganizationAssessor LLM call failed for %r: %s",
                raw_name, exc,
            )
            return None

        if response_text.strip():
            return response_text

        logger.warning(
            "OrganizationAssessor: empty response for %r — retrying",
            raw_name,
        )
        try:
            response_text = self._call_provider_with_retry(
                provider=self.provider,
                prompt=prompt,
                system=system,
                task="sse",
                search_query=None,
                retries=1,
                use_grounding=False,
                temperature=0,
            )
        except (SSEClassificationError, LLMProviderError) as exc:
            logger.warning(
                "OrganizationAssessor LLM retry failed for %r: %s",
                raw_name, exc,
            )
            return None
        return response_text if response_text.strip() else None

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
        listing_url: str | None = None,
        web_evidence: str | None = None,
    ) -> AssessedOrgResult | None:
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
            listing_url=listing_url,
        )
        prefetched = (web_evidence or "").strip()
        evidence_urls: list[str] = []
        tavily_text = ""
        tavily_snippets: list[str] = []
        evidence_results: list = []
        from llm.tavily_grounding import (
            TavilyUnavailableError,
            fetch_tavily_evidence,
            inject_grounding_evidence,
            require_tavily,
        )
        from utils.source_grounding import (
            WebsiteFetchCache,
            evidence_snippets_from_results,
            fetch_website_text,
        )
        from utils.website_verify import urls_from_evidence_text

        fetch_cache = WebsiteFetchCache()

        # Listing page is authoritative identity evidence — fetch before Tavily/LLM.
        listing = (listing_url or "").strip() or None
        listing_block = ""
        if listing:
            listing_text, listing_title = fetch_website_text(
                listing, timeout=8.0, cache=fetch_cache,
            )
            if listing_text or listing_title:
                body = (listing_text or "")[:3000]
                listing_block = (
                    f"{_LISTING_EVIDENCE_HEADER}"
                    f"Title: {listing_title or '(none)'}\n"
                    f"URL: {listing}\n"
                    f"{body}\n\n---\n\n"
                )
                prompt = listing_block + prompt

        search_query = _build_search_query(
            raw_name,
            municipality,
            province,
            known_website=known_website,
            job_title=job_title,
        )
        prefer_hosts = _prefer_hosts_for_assess(
            known_website=known_website,
            listing_url=listing,
            raw_name=raw_name,
        )
        from llm.tavily_grounding import entity_require_terms

        require_terms = entity_require_terms(raw_name) or None
        location_terms = _location_terms_for_tavily(municipality, province) or None

        # Prefetch Tavily in the assessor so we have structured evidence URLs
        # for website confirmation. Inject into the prompt and disable nested
        # grounding to avoid a second search.
        evidence_block = ""
        if prefetched:
            evidence_block = prefetched
            evidence_urls = urls_from_evidence_text(prefetched)
            tavily_text = prefetched
            tavily_snippets = [prefetched]
        else:
            # Hard-require before the LLM call — never assess with empty evidence
            # when the Tavily package/key is broken (hallucinated websites).
            require_tavily()
            evidence = fetch_tavily_evidence(
                search_query,
                prefer_hosts=prefer_hosts,
                require_terms=require_terms,
                location_terms=location_terms,
            )
            if evidence.text:
                evidence_block = evidence.text
            evidence_urls = list(evidence.urls)
            tavily_text = evidence.text
            evidence_results = list(evidence.results)
            tavily_snippets = evidence_snippets_from_results(
                [
                    {"title": r.title, "url": r.url, "content": r.content}
                    for r in evidence.results
                ]
            )

        if evidence_block:
            prompt = inject_grounding_evidence(prompt, evidence_block)

        try:
            response_text = self._llm_complete(
                prompt=prompt,
                system=_ASSESSOR_SYSTEM,
                raw_name=raw_name,
            )
        except TavilyUnavailableError:
            # Never soft-None when web research is broken — callers must abort.
            raise

        if not response_text:
            return None

        result = _parse_response(response_text, raw_name)
        if result is None:
            return None
        result = _apply_website_known_guard(result, known_website)

        # Fetch confirmed-candidate homepage once (cached) for geo + name + grounding.
        site_text, site_title = "", ""
        candidate_url = result.get("website")
        if candidate_url:
            site_text, site_title = fetch_website_text(
                candidate_url, timeout=8.0, cache=fetch_cache,
            )

        evidence_snippet = _evidence_blob_for_url(evidence_results, candidate_url)
        result = _confirm_result_website(
            result,
            evidence_urls=evidence_urls,
            known_website=known_website,
            municipality=municipality,
            province=province,
            site_text=site_text,
            site_title=site_title,
            org_raw_name=raw_name,
            evidence_snippet=evidence_snippet or None,
        )
        # If confirmation kept a different/normalized URL, refresh fetch.
        confirmed_url = result.get("website")
        if confirmed_url and confirmed_url != candidate_url:
            site_text, site_title = fetch_website_text(
                confirmed_url, timeout=8.0, cache=fetch_cache,
            )
        elif not confirmed_url:
            site_text, site_title = "", ""

        result = _demote_extracted_without_confirmed_website(result)
        # Listing page text can ground identity-adjacent description when present.
        listing_ground = listing_block if listing_block else ""
        result = _apply_source_grounding(
            result,
            website_text=site_text,
            website_title=site_title,
            tavily_text=(listing_ground + "\n" + tavily_text).strip() if listing_ground else tavily_text,
            tavily_snippets=([listing_ground] if listing_ground else []) + list(tavily_snippets),
            source_description=source or None,
        )
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
        listing_url: str | None = None,
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
            listing_url=listing_url,
        )
        if result is None:
            return None

        loc_str = canonical_loc or None
        # parse_address_with_geocodio always returns a complete dict (municipality, province,
        # lat, lng, geocode_accuracy_type); it handles None/empty internally.
        geo_data = parse_address_with_geocodio(loc_str)

        return _attach_org_language(
            {
                "name": result["canonical_name"],
                "slug": result["slug"],
                "location": loc_str,
                "website": result["website"],
                "municipality": geo_data.get("municipality"),
                "province": geo_data.get("province"),
                "lat": geo_data.get("lat"),
                "lng": geo_data.get("lng"),
                "geocode_accuracy_type": geo_data.get("geocode_accuracy_type"),
                **_result_to_db_fields(result, provider=self.provider),
            },
            result.get("public_language"),
            fetch_web=fetch_web,
        )

    def assess_and_build_update(
        self,
        org: dict,
        force_lang: bool = False,
        fetch_web: bool = False,
        *,
        job_title: str = "",
        listing_url: str | None = None,
        municipality: str | None = None,
        province: str | None = None,
    ) -> dict | None:
        """Re-assess an existing org and return an update dict.

        Includes website when the assessor returns an employer-owned host.
        Passes the org's current website (if evidence-grade) into search/prompt.
        Optional job_* / listing_url / location overrides come from a linked job.
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
        mun = municipality if municipality is not None else org.get("municipality")
        prov = province if province is not None else org.get("province")
        # Stored description is SOURCE DESCRIPTION for description_* only (prompt-gated).
        # It does not disable Tavily; interpretive fields still use web research.
        result = self.assess(
            raw_name=name,
            municipality=mun,
            province=prov,
            job_title=job_title or "",
            description="",
            known_website=known_website,
            existing_description=existing,
            listing_notes="",
            listing_url=listing_url,
        )
        if result is None:
            return None

        updates = _result_to_db_fields(result, provider=self.provider)
        force_clear = _should_force_clear_copy(result)
        updates = _omit_null_locale_fields_from_update(
            updates, force_clear_ungrounded=force_clear,
        )
        updates = _merge_sse_details_preserving_reasoning(updates, org.get("sse_details"))
        # Confirmed website only — None clears invented/dead hosts from prior runs.
        updates["website"] = result.get("website")
        if force_clear:
            updates["values"] = result.get("values_raw")

        # Geocode when we have a location string (same as assess_and_build_row).
        # Only write coords/geo fields when Geocodio returns values — never wipe
        # existing good lat/lng with nulls on failure.
        loc_str = (org.get("location") or "").strip() or None
        if not loc_str:
            mun_s = (mun or "").strip() or None
            prov_s = (prov or "").strip() or None
            if mun_s and prov_s:
                loc_str = f"{mun_s}, {prov_s}"
            elif mun_s or prov_s:
                loc_str = mun_s or prov_s
        if loc_str:
            geo_data = parse_address_with_geocodio(loc_str)
            if geo_data.get("lat") is not None and geo_data.get("lng") is not None:
                for key in (
                    "municipality",
                    "province",
                    "lat",
                    "lng",
                    "geocode_accuracy_type",
                ):
                    val = geo_data.get(key)
                    if val is not None:
                        updates[key] = val

        return _attach_org_language(
            {
                "name": name,
                "language": org.get("language"),
                **updates,
                "description": (
                    updates.get("description")
                    if force_clear
                    else (updates.get("description") or org.get("description"))
                ),
                "mission_statement": (
                    updates.get("mission_statement")
                    if force_clear
                    else (
                        updates.get("mission_statement")
                        or org.get("mission_statement")
                    )
                ),
                "website": updates.get("website"),
            },
            result.get("public_language"),
            force_lang=force_lang,
            fetch_web=fetch_web,
        )
