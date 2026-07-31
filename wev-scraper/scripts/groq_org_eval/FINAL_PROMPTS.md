# Final Groq org-assessment prompts (recommended)

Shared base remains `OrganizationAssessor` in `utils/organization_assessment.py`
(+ SSE criteria in `utils/sse_prompts.py`).

## Website rules (applied in production)

```
WEBSITE RULES for the "website" field:
- Prefer the organization's own official homepage (the domain they control).
- If ORGANIZATION DATA lists a Known website, prefer that URL unless it violates
  the rules below (shared/ATS/social) — then discover a better employer-owned site.
- Do NOT use job-board, ATS, or careers-platform URLs (e.g. Greenhouse, Lever,
  Workday, Indeed, CharityVillage, LinkedIn jobs).
- Do NOT use social profiles or link aggregators (Facebook, Instagram, LinkedIn
  company pages, Linktree, bit.ly) unless that is truly their only web presence
  — in that case return null instead (social hosts are not reliable identity).
- Do NOT use the scraped job listing URL.
- If Known website is "(none …)" / missing: return null unless research/search
  evidence clearly identifies the employer-owned homepage. Never invent a domain
  from the organization name (e.g. name.ca / name.org guesses).
- If you cannot confidently identify the employer-owned site, return null.
- Prefer https:// and the apex/homepage over a deep job posting path.
```

## Language rules (applied in production)

```
PUBLIC_LANGUAGE RULES:
Priority for public_language (en | fr | bilingual | null):
1. Actual public-facing website language in materials you observed
2. Explicit website language metadata
3. hreflang or URL locale hints (/en/, /fr/, lang=, locale=)
4. Organization name only as weak evidence
- Verify name leaning against the organization's own materials you observed.
- Do not infer from the language of this JSON response.
- Return bilingual ONLY when materials show substantial English AND French
  (or an explicit bilingual claim) — not merely a French or English legal name.
- If there is insufficient evidence, return null.
```

## Groq runtime requirements (not prompt-only)

For ungrounded Groq to approach Gemini:

1. Inject scraped homepage text into the assessor `description` / notes field
   (harness flag: `--inject-website-evidence`).
2. Deterministic post-rule: if no Known website, force `website=null`
   (do not keep model-invented domains).
3. Keep existing SSE governance gate (`type` government/other → rating `no`).

See `prompt_addenda.py` for experimental addenda (v1 rejected; v2/v3 notes).
