# Groq org-assessor prompt changelog

Reference: stored Gemini assessments in production Supabase (`sse_rating IS NOT NULL`).
Harness: `scripts/compare_groq_org_assessment.py` (dry-run, no Gemini calls, no DB writes).
Addenda: `scripts/groq_org_eval/prompt_addenda.py`
Model: `llama-3.1-8b-instant` (70b daily quota was exhausted during this work).
Benchmark: same 25 ambiguous-first orgs after v0.

## v0-baseline-polluted-ollama (INVALID)

- Discarded: `ENV_MODE=local` routed language LLM to Ollama; mid-run model 404
- Artifact: `v0-baseline-polluted-ollama.json`

## v0-baseline

- What changed: none (existing OrganizationAssessor prompts)
- Why: measure disagreement before edits
- Setup: no evidence inject; no deterministic website guard
- is_sse: **80%** | sector: **44%** | language: **28%** | website: **36%**
- extraction avg/2: mission **0.12**, values **0.72**, description **0.16**
- Notes: Groq invented websites/languages where Gemini stored null; mission/description weak without grounding

## v1-evidence-null

- What changed: strict evidence-first + prefer-null + stricter SSE addendum
- Why: stop invention; align SSE wording with task brief
- is_sse: **48%** ↓ | sector: **36%** ↓ | language: **8%** ↓ | website: **36%**
- extraction: mission **0.36**, values **0.76**, description **0.64**
- Notes: **rejected** — over-strict SSE diverged from Gemini (often on Gemini rows that violate current governance gate: `type=other` + `weak_yes`)

## v2-deterministic-website

- What changed: lighter addendum + deterministic “no known website → null website” + evidence inject
- Why: website invention is a code/guard problem, not only a prompt problem
- is_sse: **64%** | sector: **56%** ↑ | language: **20%** | website: **84%** ↑
- extraction: mission **0.56**, values **1.20**, description **0.84**

## v3-evidence-inject (BEST OVERALL)

- What changed: **existing prompts** (no SSE-tightening addendum) + scraped Known-website evidence in prompt + deterministic website guard
- Why: restore is_sse toward v0 while keeping website/extraction gains
- is_sse: **72%** | sector: **56%** | language: **24%** | website: **100%**
- extraction: mission **0.52**, values **1.08**, description **0.96**
- Stopped here: further prompt-only SSE tightening regresses Gemini agreement; language accuracy is dominated by Gemini-null vs Groq-fill (only 4/25 Gemini languages set; 2/4 match when set)

## Production prompt edits applied

- `utils/organization_assessment.py` `_WEBSITE_RULES`: never invent domains; null when unknown
- `utils/organization_assessment.py` `_PUBLIC_LANGUAGE_RULES`: priority list + bilingual bar raised

## Recommendation

**Groq needs deterministic rules (and evidence injection) before replacement** — Gemini should remain primary for org assessment until:
1. Groq path receives scraped/Tavily website evidence (no Google Search grounding today)
2. Deterministic website guard when Known website is absent
3. Language backfill quality in Gemini reference is complete enough to score fairly
4. Gemini reference rows with `type in (government, other)` + `is_sse=true` are reconciled with the governance gate

## Model-parity follow-ups (Gemini 3 + Tavily chain)

- **Employer identity**: job posts may name a different org than scrape metadata
  (e.g. Goparity label + TREC body). Prompts now trust the posting’s About/employer
  section over stale Organization metadata — this was not Tavily contamination.
- **Tavily**: `require_terms` soft-filter + prefer/include employer domains.
- **Ollama**: head+tail prompt truncation (keeps JSON schema + entity data); default
  budgets `OLLAMA_MAX_PROMPT_CHARS=8000`, `TAVILY_OLLAMA_MAX_CHARS=1200`.
- Artifacts: `model_parity_dry_run.json` (v1), `_v2.json`, `_v3.json`, `_v4.json`.
- **v4 job parity (cloud):** Gemini 3.6 / 3.5-lite / Groq all `strong_yes` and name **TREC**
  from the posting body (Organization metadata still says Goparity — scrape bug).
- Skip Tavily for job posts with description ≥2500 chars (avoids stale-brand search noise).
- **Description vs interpretive (current):** Tavily only when SOURCE DESCRIPTION is
  absent (org) or job posting body is empty (job). Stored/listing description may
  fill `description_*` only — never `is_sse` / sector / language / type / mission / values.
- Ollama (CPU) still often times out on full org/job JSON; chain treats it as last resort.
  Head+tail truncation + entity-at-end prompt ordering keep payload intact when it does run.
