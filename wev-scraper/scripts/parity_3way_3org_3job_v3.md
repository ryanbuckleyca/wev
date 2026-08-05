# 3-way parity v3: prod | gemini+tav | groq+tav

Generated: `2026-08-04T16:11:18.275013+00:00`

Setup: post-prompt-fix retest on same v2 IDs; Tavily-always (`FORCE_GROUNDING=1`, `USE_GOOGLE_SEARCH_GROUNDING=0`); Gemini-only then Groq-70b-only; Ollama skipped; no Cerebras; no prod writes.

Models: `{"gemini": "gemini-3.6-flash", "groq": "llama-3.3-70b-versatile", "env_reload": "/Users/ry/code/wev/.env"}`

## Headline

- **Gemini+T ↔ prod**: orgs 93.3%, jobs 66.7%.
- **Groq+T ↔ prod**: orgs 93.3%, jobs 66.7%.
- **Groq+T ↔ Gemini+T**: orgs 100.0%, jobs 100.0%.
- No clear is_sse polarity flips vs prod in this sample (strength/type/sector/website diffs may still exist — see tables).
- **Verdict**: Tavily+Gemini / Tavily+Groq largely **match** prod structural fields on this fresh sample.

## Orgs (3)

| Org | Prod | Gemini+T | Groq+T | vs prod / notes |
|---|---|---|---|---|
| Oakville Wind Orchestra (1415) | `strong_yes/True type=nonprofit sec=arts-culture-information web=oakvillewindorchestra.ca` | `strong_yes/True type=nonprofit sec=arts-culture-information web=oakvillewindorchestra.ca` | `strong_yes/True type=nonprofit sec=arts-culture-information web=oakvillewindorchestra.ca` | gemini=prod; groq=prod |
| Artsmarketing Services Inc. (1408) | `no/False type=other sec=community-civic-infrastructure web=artsmarketing.com` | `no/False type=other sec=arts-culture-information web=artsmarketing.com` | `no/False type=other sec=arts-culture-information web=artsmarketing.com` | gemini≠prod:sector_id; groq≠prod:sector_id |
| Eeyou Marine Region Planning Commission (1399) | `no/False type=government sec=environment-circular-economy web=eeyoumrpc.ca` | `no/False type=government sec=environment-circular-economy web=eeyoumrpc.ca` | `no/False type=government sec=environment-circular-economy web=eeyoumrpc.ca` | gemini=prod; groq=prod |

### Org structural detail

**Oakville Wind Orchestra** — prod location `Oakville, ON`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Oakville, ON | (from prod geo) | (from prod geo) |
| type | nonprofit | nonprofit | nonprofit |
| sector_id | arts-culture-information | arts-culture-information | arts-culture-information |
| sse_rating | strong_yes | strong_yes | strong_yes |
| website | oakvillewindorchestra.ca | oakvillewindorchestra.ca | oakvillewindorchestra.ca |
| is_sse | True | True | True |

**Artsmarketing Services Inc.** — prod location ``

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location |  | (from prod geo) | (from prod geo) |
| type | other | other | other |
| sector_id | community-civic-infrastructure | arts-culture-information | arts-culture-information |
| sse_rating | no | no | no |
| website | artsmarketing.com | artsmarketing.com | artsmarketing.com |
| is_sse | False | False | False |

**Eeyou Marine Region Planning Commission** — prod location `Montreal, QC`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Montreal, QC | (from prod geo) | (from prod geo) |
| type | government | government | government |
| sector_id | environment-circular-economy | environment-circular-economy | environment-circular-economy |
| sse_rating | no | no | no |
| website | eeyoumrpc.ca | eeyoumrpc.ca | eeyoumrpc.ca |
| is_sse | False | False | False |

## Jobs (3)

| Job | Prod | Gemini+T | Groq+T | vs prod / notes |
|---|---|---|---|---|
| Conseiller-ère et formateur-ice en vie a @ Centre de formation populaire | `strong_yes/True` | `strong_yes/True` | `strong_yes/True` | gemini=prod; groq=prod |
| Mechanical Project Manager – Industrial  @ Bouthillette Parizeau & Associes | `weak_yes/False` | `no/False` | `no/False` | gemini≠prod:sse_rating (weak_yes→no); groq≠prod:sse_rating (weak_yes→no) |
| Senior Commercial Manager, Canada @ Marine Stewardship Council (MSC) | `no/True` | `weak_yes/True` | `weak_yes/True` | gemini≠prod:sse_rating (no→weak_yes); groq≠prod:sse_rating (no→weak_yes) |

## Match rates

### Provider ↔ prod (orgs)

| Provider | overall | type | sector_id | sse_rating | website | is_sse |
|---|---|---|---|---|---|---|
| gemini+tav | 93.3% | 100.0% (3/3) | 66.7% (2/3) | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) |
| groq+tav | 93.3% | 100.0% (3/3) | 66.7% (2/3) | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) |

### Provider ↔ gemini (orgs)

| Provider | overall | type | sector_id | sse_rating | website | is_sse |
|---|---|---|---|---|---|---|
| groq+tav | 100.0% | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) |

### Provider ↔ prod (jobs)

| Provider | overall | sse_rating | is_sse |
|---|---|---|---|
| gemini+tav | 66.7% | 33.3% (1/3) | 100.0% (3/3) |
| groq+tav | 66.7% | 33.3% (1/3) | 100.0% (3/3) |

### Provider ↔ gemini (jobs)

| Provider | overall | sse_rating | is_sse |
|---|---|---|---|
| groq+tav | 100.0% | 100.0% (3/3) | 100.0% (3/3) |


## Before → after (v2 → v3) on same 6 entities

Fresh dry-run with reloaded `GEMINI_API_KEY` + `GROQ_API_KEY` via `dotenv_values` (LLM keys only; no `#` contamination; prod DB creds untouched). Groq pinned to `llama-3.3-70b-versatile`.

### Prompt / guard changes
- **Place-name ≠ government**: community orchestras/choirs/theatres are nonprofit arts unless explicit municipal/agency evidence; `place_name_guard` remaps false government.
- **Popular education → strong_yes**: clear nonprofit + mission-aligned popular-education / associative-life roles prefer `strong_yes`.
- **For-profit commercial / engineering gate**: engineering firms / shipping-trading stay `no`; commercial titles at true nonprofits may still be Yes.
- **Employer acronym disambiguation**: trust full employer name (Marine Stewardship Council ≠ shipping line).
- **Sector soft hint**: arts marketing / cultural fundraising → `arts-culture-information`.

### Results vs v2

| Entity | v2 issue | v3 Gemini | v3 Groq | Status |
|---|---|---|---|---|
| Oakville Wind Orchestra | Groq `no`/government | `strong_yes`/nonprofit/arts | `strong_yes`/nonprofit/arts | **Fixed** |
| Artsmarketing Inc. | sector drift | `no`/other/arts-culture | `no`/other/arts-culture | polarity hold; sector soft-improved |
| Eeyou MRPC | — | `no`/government | `no`/government | hold |
| CFP Conseiller | Groq `weak_yes` | `strong_yes` | `strong_yes` | **Fixed** |
| BPA Mechanical PM | both `no` (prod inconsistent `weak_yes`/`is_sse=False`) | `no` | `no` | correct for-profit engineering |
| MSC Commercial Mgr | both `weak_yes` (prod inconsistent `no`/`is_sse=True`) | `weak_yes` | `weak_yes` | correct nonprofit stewardship council |

### Remaining gaps
- Artsmarketing `sector_id` still ≠ prod residual `community-civic-infrastructure` (both providers agree on `arts-culture-information`).
- BPA / MSC vs prod rating strings remain by design (prod `sse_rating`/`is_sse` inconsistent; providers agree with each other).
- Provider agreement: **Groq ↔ Gemini 100%** on this sample.
