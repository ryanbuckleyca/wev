# Gemini 3 + Tavily fallback chain

Branch goal: replace `gemini-2.5-flash` / `gemini-2.5-flash-lite` with Gemini 3
free-tier models, share **one** Tavily evidence pack across backends, and fall
back through free Groq to local Ollama when API credits are exhausted.

## Chain (SSE / org assessment)

1. `gemini-3.6-flash` (override: `GEMINI_SSE_PRIMARY_MODEL`)
2. `gemini-3.5-flash-lite` (override: `GEMINI_SSE_LITE_MODEL`)
3. Groq (`llama-3.3-70b-versatile`, with in-provider model fallbacks)
4. Ollama via `LocalGroundedProvider` (when installed / reachable)

`get_sse_provider()` / `get_fallback_llm_provider()` always build this chain
(even when `ENV_MODE=local`). Summaries can still prefer Ollama-only in local mode.

## Predictable criteria (same evidence for all four)

For `task=sse`, `SSEFallbackProvider`:

1. Calls Tavily once (`llm/tavily_grounding.py`)
2. Injects identical `SCRAPED / SEARCH EVIDENCE` into the prompt
3. Calls each backend with `use_grounding=False` by default so Gemini does **not**
   also run Google Search (which would diverge from Groq/Ollama)

Opt back into Gemini Google Search with `USE_GOOGLE_SEARCH_GROUNDING=1` (not
recommended when comparing providers).

Shared org prompts (`OrganizationAssessor` + `sse_prompts`) plus:

- **Description vs research:** stored/listing description may fill `description_*`
  only; `is_sse`, sector, language, type, mission, values, website come from web
  research (Tavily or prefetched site text) — never from that blurb.
- **Jobs:** Tavily only when the posting has no description text yet.
- Website: prefer Known website; never invent domains from the name
- Language: en / fr / bilingual / null with evidence priority
- SSE: governance gate (`government` / `other` → no)
- Sector: taxonomy-only or null

## Required keys

- `GEMINI_API_KEY` — free Gemini tiers
- `GROQ_API_KEY` — free Groq tiers
- `TAVILY_API_KEY` — shared grounding (already used by local grounded)
- Ollama + `LOCAL_LLM_MODEL` — final fallback

## Files

- `llm/tavily_grounding.py` — shared fetch + inject
- `llm/gemini_fallback.py` — chain + evidence injection
- `llm/factory.py` / `llm/unified_provider.py` — Gemini 3 model IDs + Ollama last
- `utils/organization_assessment.py` — website known-guard + prompt rule tweaks
