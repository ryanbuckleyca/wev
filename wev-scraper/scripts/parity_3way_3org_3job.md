# 3-way parity: prod | gemini+tav | groq+tav

Generated: `2026-08-04T14:56:00.735385+00:00`

Setup: Tavily-always (`FORCE_GROUNDING=1`, `USE_GOOGLE_SEARCH_GROUNDING=0`); Gemini-only then Groq-only; Ollama skipped; no Cerebras; no prod writes.

Models: `{"gemini": "gemini-3.6-flash", "groq": "llama-3.3-70b-versatile"}`

## Headline

- **Gemini+T ↔ prod**: orgs 73.3%, jobs 66.7% (website always null on re-assess — rating/type/is_sse otherwise strong).
- **Groq+T ↔ prod**: orgs 53.3%, jobs **100.0%**.
- **Groq+T ↔ Gemini+T**: orgs 80.0%, jobs 66.7%.
- **Match / improve**: Jobs — Groq+Tavily matched prod on all 3 (incl. for-profit Cité Construction correctly `no`). Gemini matched 2/3; **regressed** Agence Ometz (`weak_yes`→`no`). Orgs — both keep Green Communities `strong_yes` and Markham gov `no`; Gemini keeps Rainbow Songs for-profit correctly `no`; **Groq regresses** Rainbow Songs (`no`→`weak_yes` / type→nonprofit).
- **Verdict**: Tavily+Gemini **matches** prod SSE polarity on orgs; Tavily+Groq **matches** prod on jobs and mostly orgs but **does not improve** the for-profit case (over-calls SSE). No clear win vs old Gemini-grounding prod beyond shared Tavily consistency between providers.

## Orgs (3)

| Org | Prod | Gemini+T | Groq+T | vs prod / notes |
|---|---|---|---|---|
| Green Communities Canada (1419) | `strong_yes/True type=nonprofit sec=environment-circular-economy web=greencommunitiescanada.org` | `strong_yes/True type=nonprofit sec=environment-circular-economy web=None` | `strong_yes/True type=nonprofit sec=environment-circular-economy web=None` | gemini≠prod:website; groq≠prod:website |
| Rainbow Songs Inc. (1416) | `no/False type=other sec=arts-culture-information web=rainbowsongs.com` | `no/False type=other sec=education-knowledge web=None` | `weak_yes/True type=nonprofit sec=education-knowledge web=None` | gemini≠prod:sector_id,website (for-profit correctly no); groq: REGRESSION for-profit no→weak_yes |
| City of Markham (1413) | `no/False type=government sec=community-civic-infrastructure web=markham.ca` | `no/False type=government sec=community-civic-infrastructure web=None` | `no/False type=government sec=community-civic-infrastructure web=None` | gemini≠prod:website; groq≠prod:website |

### Org structural detail

**Green Communities Canada** — prod location `Toronto, ON`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Toronto, ON | (from prod geo) | (from prod geo) |
| type | nonprofit | nonprofit | nonprofit |
| sector_id | environment-circular-economy | environment-circular-economy | environment-circular-economy |
| sse_rating | strong_yes | strong_yes | strong_yes |
| website | greencommunitiescanada.org | None | None |
| is_sse | True | True | True |

**Rainbow Songs Inc.** — prod location `Toronto, ON`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Toronto, ON | (from prod geo) | (from prod geo) |
| type | other | other | nonprofit |
| sector_id | arts-culture-information | education-knowledge | education-knowledge |
| sse_rating | no | no | weak_yes |
| website | rainbowsongs.com | None | None |
| is_sse | False | False | True |

**City of Markham** — prod location `Markham, ON`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Markham, ON | (from prod geo) | (from prod geo) |
| type | government | government | government |
| sector_id | community-civic-infrastructure | community-civic-infrastructure | community-civic-infrastructure |
| sse_rating | no | no | no |
| website | markham.ca | None | None |
| is_sse | False | False | False |

## Jobs (3)

| Job | Prod | Gemini+T | Groq+T | vs prod / notes |
|---|---|---|---|---|
| Coordonnateur·trice de l’engagement comm @ Le Dépôt: centre communautaire d'alimentation | `strong_yes/True` | `strong_yes/True` | `strong_yes/True` | gemini=prod; groq=prod |
| Employment Specialist Assistant @ Agence Ometz | `weak_yes/True` | `no/False` | `weak_yes/True` | gemini: REGRESSION weak_yes→no; groq=prod |
| Environmental Project Manager @ Cité Construction TM inc. | `no/False` | `no/False` | `no/False` | gemini=prod; groq=prod |

## Match rates

### Provider ↔ prod (orgs)

| Provider | overall | type | sector_id | sse_rating | website | is_sse |
|---|---|---|---|---|---|---|
| gemini+tav | 73.3% | 100.0% (3/3) | 66.7% (2/3) | 100.0% (3/3) | 0.0% (0/3) | 100.0% (3/3) |
| groq+tav | 53.3% | 66.7% (2/3) | 66.7% (2/3) | 66.7% (2/3) | 0.0% (0/3) | 66.7% (2/3) |

### Provider ↔ gemini (orgs)

| Provider | overall | type | sector_id | sse_rating | website | is_sse |
|---|---|---|---|---|---|---|
| groq+tav | 80.0% | 66.7% (2/3) | 100.0% (3/3) | 66.7% (2/3) | 100.0% (3/3) | 66.7% (2/3) |

### Provider ↔ prod (jobs)

| Provider | overall | sse_rating | is_sse |
|---|---|---|---|
| gemini+tav | 66.7% | 66.7% (2/3) | 66.7% (2/3) |
| groq+tav | 100.0% | 100.0% (3/3) | 100.0% (3/3) |

### Provider ↔ gemini (jobs)

| Provider | overall | sse_rating | is_sse |
|---|---|---|---|
| groq+tav | 66.7% | 66.7% (2/3) | 66.7% (2/3) |
