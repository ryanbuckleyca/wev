"""Versioned Groq-oriented org-assessment prompt addenda.

These are appended to the existing OrganizationAssessor prompt when evaluating
Groq agreement with stored Gemini results. They do not replace the shared
Gemini-era prompt body — they tighten evidence / null / SSE / language rules
for models without Google Search grounding.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# v1 — evidence-first + prefer-null over invention
# ---------------------------------------------------------------------------
V1_ADDENDUM = """
GROQ / UNGROUNDED MODEL RULES (mandatory — override softer guidance above when conflicting):

EVIDENCE-FIRST:
- Base is_sse, sector_id, public_language, website, mission, values, and description
  ONLY on: (1) Known website URL if provided, (2) ORGANIZATION DATA notes / scraped
  website text in this prompt, (3) explicit statements in that text.
- Do NOT classify from the organization name alone, location alone, or isolated
  keywords without supporting sentences in the provided text.
- If the prompt includes a "SCRAPED WEBSITE TEXT" or "Org/listing notes" section,
  treat that as primary evidence. If it is empty/missing, prefer null for
  website / sector_id / public_language / mission / description / values_raw
  rather than inventing.

WEBSITE:
- If Known website is a real employer-owned URL, return that exact URL (normalize
  to https homepage) unless the notes prove it is wrong.
- If Known website is "(none …)", return null. Do NOT invent a domain from the
  name (e.g. name.ca). Guessing websites is worse than null.
- Never invent plausible-looking domains.

SSE ("is SSE organization" via sse_rating):
- SSE Yes (strong_yes / weak_yes) only when primary purpose + governance align
  with solidarity economy: cooperatives, nonprofits with social/economic/community
  missions, social enterprises with SSE governance evidence, community orgs.
- NOT SSE: conventional companies with CSR; orgs that only serve SSE clients;
  government agencies; universities; sustainability-focused companies without
  SSE structure/purpose. "Supports SSE" ≠ "is an SSE organization".
- type government or other → sse_rating MUST be "no".
- If evidence is thin, prefer sse_rating "no" over weak_yes.

SECTOR:
- Choose ONLY from ALLOWED SECTORS. Never invent sector ids.
- Prefer sector_id null when evidence is insufficient or only incidental.
- Do not confuse organization type (nonprofit/coop) with sector.

LANGUAGE (public_language):
Priority: (1) public-facing website language in provided text/metadata,
(2) explicit language statements, (3) hreflang / URL locale hints in Known website,
(4) organization name only as weak evidence.
Allowed values: en, fr, bilingual, or null.
- Prefer null over guessing bilingual when evidence is weak.
- A French legal name alone is not enough for bilingual without FR+EN site evidence.
- Do not use the language of this JSON response as evidence.

EXTRACTION (mission / description / values_raw):
- Extract or closely paraphrase ONLY facts present in provided evidence.
- Do not invent founding stories, program lists, or impact claims.
- If evidence is insufficient, return null / empty rather than marketing filler.
"""

# ---------------------------------------------------------------------------
# v2 — match Gemini reference without over-correcting SSE; deterministic website
# ---------------------------------------------------------------------------
V2_ADDENDUM = """
GROQ / UNGROUNDED MODEL RULES (mandatory when conflicting with softer guidance):

EVIDENCE-FIRST:
- Prefer facts from Known website + Org/listing notes / SCRAPED WEBSITE TEXT.
- Do not invent mission, description, values, websites, or sector from the name alone.

WEBSITE:
- If Known website is a real employer-owned URL, return that URL (https homepage).
- If Known website is "(none …)", return null. Do not invent domains.

SSE:
- Follow ORG_EVALUATION_CRITERIA and ORG_RATING_GUIDELINES already above.
- "Supports SSE" / CSR / green marketing without SSE governance → "no".
- type government or other → "no".
- Eligible nonprofit/cooperative/union with clear community/social mission and
  must-haves → prefer weak_yes rather than no when evidence is partial but real
  (do not over-penalize board-led nonprofits).

SECTOR:
- Only ALLOWED SECTORS ids, or null if uncertain. Never invent ids.

LANGUAGE (public_language):
- Allowed: en, fr, bilingual, null.
- bilingual only with clear EN+FR public-material evidence in notes/site.
- Prefer null when unsure (do not guess bilingual from a French-looking name alone).

EXTRACTION:
- Paraphrase only what evidence supports; otherwise null / empty values.
"""

PROMPT_ADDENDA: dict[str, str] = {
    "v0-baseline": "",
    "v1-evidence-null": V1_ADDENDUM,
    "v2-bilingual-sector": V2_ADDENDUM,
    "v2-deterministic-website": V2_ADDENDUM,
    # Best measured combo: existing prompts + harness evidence inject +
    # deterministic no-invented-website (addendum empty — rules applied in code).
    "v3-evidence-inject": "",
}


def get_prompt_addendum(prompt_version: str) -> str:
    """Return addendum text for a prompt version label (empty if unknown/baseline)."""
    if prompt_version in PROMPT_ADDENDA:
        return PROMPT_ADDENDA[prompt_version]
    # Allow aliases like v1-*
    for key, text in PROMPT_ADDENDA.items():
        if prompt_version.startswith(key.split("-")[0]) and key != "v0-baseline":
            # e.g. v1-foo → try exact first only; fall through
            pass
    if prompt_version.startswith("v1"):
        return V1_ADDENDUM
    if prompt_version.startswith("v2"):
        return V2_ADDENDUM
    return ""
