# 3-way parity v2: prod | gemini+tav | groq+tav

Generated: `2026-08-04T15:38:12.793916+00:00`

Setup: post-fix retest; Tavily-always (`FORCE_GROUNDING=1`, `USE_GOOGLE_SEARCH_GROUNDING=0`); Gemini-only then Groq-only; Ollama skipped; no Cerebras; no prod writes. New IDs (excludes prior parity).

Models: `{"gemini": "gemini-3.6-flash", "groq": "llama-3.3-70b-versatile", "gemini_retry": "settings key + Oakville 503 retries"}`

## Headline

- **Gemini+T ↔ prod**: orgs **93.3%**, jobs 66.7% (`gemini-3.6-flash`; key reloaded via settings).
- **Groq+T ↔ prod**: orgs 66.7%, jobs 50.0%.
- **Groq+T ↔ Gemini+T**: orgs 66.7%, jobs 83.3%.
- **Websites stick**: **YES** — Gemini 100%, Groq 100% (known sites survive re-assess).
- **For-profit Inc.**: Artsmarketing Services Inc. → both `other`/`no` (sector_id only mismatch).
- **Orgs**: Gemini matches prod on Oakville + Eeyou; Artsmarketing rating/type/web match (sector differs). Groq regresses Oakville (`strong_yes`→`no`/government).
- **Jobs**: Gemini=prod on Centre de formation; both providers `no` on BPA (prod `weak_yes`/`is_sse=False`); both Yes on MSC (prod `no`/`is_sse=True`).
- **Verdict**: Website fix confirmed on 3.6-flash. Inc. for-profit polarity holds. Gemini org structural match strong; remaining job gaps are rating-string noise vs inconsistent prod `sse_rating`/`is_sse` pairs.
## Orgs (3)

| Org | Prod | Gemini+T | Groq+T | vs prod / notes |
|---|---|---|---|---|
| Oakville Wind Orchestra (1415) | `strong_yes/True type=nonprofit sec=arts-culture-information web=oakvillewindorchestra.ca` | `strong_yes/True type=nonprofit sec=arts-culture-information web=oakvillewindorchestra.ca` | `no/False type=government sec=community-civic-infrastructure web=oakvillewindorchestra.ca` | gemini=prod; groq: REGRESSION sse strong_yes→no |
| Artsmarketing Services Inc. (1408) | `no/False type=other sec=community-civic-infrastructure web=artsmarketing.com` | `no/False type=other sec=arts-culture-information web=artsmarketing.com` | `no/False type=other sec=care-health-social-services web=artsmarketing.com` | gemini≠prod:sector_id; groq≠prod:sector_id |
| Eeyou Marine Region Planning Commission (1399) | `no/False type=government sec=environment-circular-economy web=eeyoumrpc.ca` | `no/False type=government sec=environment-circular-economy web=eeyoumrpc.ca` | `no/False type=government sec=environment-circular-economy web=eeyoumrpc.ca` | gemini=prod; groq=prod |

### Org structural detail

**Oakville Wind Orchestra** — prod location `Oakville, ON`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Oakville, ON | (from prod geo) | (from prod geo) |
| type | nonprofit | nonprofit | government |
| sector_id | arts-culture-information | arts-culture-information | community-civic-infrastructure |
| sse_rating | strong_yes | strong_yes | no |
| website | oakvillewindorchestra.ca | oakvillewindorchestra.ca | oakvillewindorchestra.ca |
| is_sse | True | True | False |

**Artsmarketing Services Inc.** — prod location ``

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location |  | (from prod geo) | (from prod geo) |
| type | other | other | other |
| sector_id | community-civic-infrastructure | arts-culture-information | care-health-social-services |
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
| Conseiller-ère et formateur-ice en vie a @ Centre de formation populaire | `strong_yes/True` | `strong_yes/True` | `weak_yes/True` | gemini=prod; groq≠prod:sse_rating (strong_yes→weak_yes) |
| Mechanical Project Manager – Industrial  @ Bouthillette Parizeau & Associes | `weak_yes/False` | `no/False` | `no/False` | gemini≠prod:sse_rating (weak_yes→no); groq≠prod:sse_rating (weak_yes→no) |
| Senior Commercial Manager, Canada @ Marine Stewardship Council (MSC) | `no/True` | `weak_yes/True` | `weak_yes/True` | gemini≠prod:sse_rating (no→weak_yes); groq≠prod:sse_rating (no→weak_yes) |

## Match rates

### Provider ↔ prod (orgs)

| Provider | overall | type | sector_id | sse_rating | website | is_sse |
|---|---|---|---|---|---|---|
| gemini+tav | 93.3% | 100.0% (3/3) | 66.7% (2/3) | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) |
| groq+tav | 66.7% | 66.7% (2/3) | 33.3% (1/3) | 66.7% (2/3) | 100.0% (3/3) | 66.7% (2/3) |

### Provider ↔ gemini (orgs)

| Provider | overall | type | sector_id | sse_rating | website | is_sse |
|---|---|---|---|---|---|---|
| groq+tav | 66.7% | 66.7% (2/3) | 33.3% (1/3) | 66.7% (2/3) | 100.0% (3/3) | 66.7% (2/3) |

### Provider ↔ prod (jobs)

| Provider | overall | sse_rating | is_sse |
|---|---|---|---|
| gemini+tav | 66.7% | 33.3% (1/3) | 100.0% (3/3) |
| groq+tav | 50.0% | 0.0% (0/3) | 100.0% (3/3) |

### Provider ↔ gemini (jobs)

| Provider | overall | sse_rating | is_sse |
|---|---|---|---|
| groq+tav | 83.3% | 66.7% (2/3) | 100.0% (3/3) |
