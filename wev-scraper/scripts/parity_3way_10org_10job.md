# 3-way parity: prod | gemini+tav | groq+tav — 10 orgs + 10 jobs

Generated: `2026-08-05T15:39:28.431909+00:00`

> **INCOMPLETE Groq coverage**: Gemini+Tavily finished **10/10 orgs + 10/10 jobs**. Groq+Tavily finished **7/10 orgs + 2/10 jobs**. Remaining 11 Groq calls failed on `llama-3.3-70b-versatile` **tokens-per-day (TPD ~99.7k/100k)**. Checkpoint at `/tmp/parity_3way_10org_10job_checkpoint.json` — resume with:
> `CONFIRM_PROD_RUN=YES ./venv/bin/python scripts/parity_3way_10org_10job.py --prod --resume --sleep 20`
> once Groq TPD recovers (or a fresh Groq key is in `/Users/ry/code/wev/.env`).

Setup: fresh 10+10 sample (excludes prior 3-way / gemini job parity entities); Tavily-always (`FORCE_GROUNDING=1`, `USE_GOOGLE_SEARCH_GROUNDING=0`); Gemini-only (primary→lite) then Groq-70b-only; Ollama skipped; no Cerebras; no prod writes. Keys via `dotenv_values(/Users/ry/code/wev/.env)`.

Models: `{"gemini_primary": "gemini-3.6-flash", "gemini_lite": "gemini-3.5-flash-lite", "groq": "llama-3.3-70b-versatile", "env_reload": "/Users/ry/code/wev/.env", "staging_llm": false}`

## Headline

- **Completeness**: Gemini 10/10 orgs + 10/10 jobs; Groq 7/10 orgs + 2/10 jobs (TPD blocked).
- **Gemini+T ↔ prod**: orgs **82.0%**, jobs **60.0%** (is_sse 80% both).
- **Groq+T ↔ prod** (completed only): orgs **77.1%** (n=7), jobs **100.0%** (n=2) — jobs rate is not meaningful yet.
- **Groq+T ↔ Gemini+T** (completed only): orgs **94.3%** (sse/is_sse/type/website **100%** on n=7; sector 71%), jobs **100%** (n=2).
- **Website stick**: Gemini **100%** (8/8 with prod site); Groq **100%** (5/5 completed with prod site).
- **Verdict (Gemini complete; Groq partial)**: Tavily+Gemini is **as good or better than prod on polarity for clear for-profit/gov `no`**, and often **corrects prod over-calls** (Pomerleau, DCC, Conservation Halton, Cambium/Selva). Residual risk is **employer mis-attribution on thin job listings** (Evergreen RFP → Hamilton CF). Groq tracks Gemini tightly where it finished — finish the 11 missing calls before declaring Groq parity.

## Orgs (10)

| Org | Prod | Gemini+T | Groq+T | vs prod / notes |
|---|---|---|---|---|
| Épicerie Le Détour (1420) | `strong_yes/True type=nonprofit sec=agriculture-food-systems web=epicerieledetour.org` | `strong_yes/True type=nonprofit sec=agriculture-food-systems web=epicerieledetour.org` | `strong_yes/True type=nonprofit sec=agriculture-food-systems web=epicerieledetour.org` | gemini=prod; groq=prod |
| Theatre Aquarius (1414) | `strong_yes/True type=nonprofit sec=arts-culture-information web=theatreaquarius.org` | `strong_yes/True type=nonprofit sec=arts-culture-information web=theatreaquarius.org` | `strong_yes/True type=nonprofit sec=arts-culture-information web=theatreaquarius.org` | gemini=prod; groq=prod |
| CAFES (Community Action for Environmental Sustainability) (1129) | `weak_yes/True type=nonprofit sec=environment-circular-economy web=None` | `strong_yes/True type=nonprofit sec=environment-circular-economy web=cafesottawa.ca` | `strong_yes/True type=nonprofit sec=environment-circular-economy web=cafesottawa.ca` | gemini≠prod:sse_rating,website; groq≠prod:sse_rating,website |
| Scale Institute Society (1127) | `weak_yes/True type=nonprofit sec=financial-insurance-services web=None` | `strong_yes/True type=nonprofit sec=community-civic-infrastructure web=scaleinstitute.ca` | `strong_yes/True type=nonprofit sec=education-knowledge web=scaleinstitute.ca` | gemini≠prod:sector_id,sse_rating,website; groq≠prod:sector_id,sse_rating,website |
| Around the Block (1407) | `no/False type=other sec=retail-consumer-goods web=aroundtheblock.com` | `no/False type=other sec=retail-consumer-goods web=aroundtheblock.com` | `no/False type=other sec=retail-consumer-goods web=aroundtheblock.com` | gemini=prod; groq=prod |
| Rio Tinto (1400) | `no/False type=other sec=manufacturing-production web=riotinto.com` | `no/False type=other sec=manufacturing-production web=riotinto.com` | `no/False type=other sec=manufacturing-production web=riotinto.com` | gemini=prod; groq=prod |
| Pomerleau (1324) | `weak_yes/True type=other sec=community-civic-infrastructure web=pomerleau.ca` | `no/False type=other sec=community-civic-infrastructure web=pomerleau.ca` | `no/False type=other sec=manufacturing-production web=pomerleau.ca` | gemini: REGRESSION sse weak_yes→no; groq: REGRESSION sse weak_yes→no |
| Atomic Energy of Canada Limited (1417) | `no/False type=government sec=environment-circular-economy web=aecl.ca` | `no/False type=government sec=environment-circular-economy web=aecl.ca` | `ERR: assessor returned None` | gemini=prod; groq err |
| Norfolk County (1387) | `no/False type=government sec=community-civic-infrastructure web=norfolkcounty.ca` | `no/False type=government sec=community-civic-infrastructure web=norfolkcounty.ca` | `ERR: assessor returned None` | gemini=prod; groq err |
| Defence Construction Canada (1322) | `weak_yes/True type=government sec=environment-circular-economy web=dcc-dcc.gc.ca` | `no/False type=government sec=environment-circular-economy web=dcc-dcc.gc.ca` | `ERR: assessor returned None` | gemini: REGRESSION sse weak_yes→no; groq err |

### Org structural detail

**Épicerie Le Détour** — prod location `Montreal, QC`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Montreal, QC | (from prod geo) | (from prod geo) |
| type | nonprofit | nonprofit | nonprofit |
| sector_id | agriculture-food-systems | agriculture-food-systems | agriculture-food-systems |
| sse_rating | strong_yes | strong_yes | strong_yes |
| website | epicerieledetour.org | epicerieledetour.org | epicerieledetour.org |
| is_sse | True | True | True |

- prod mission: Our mission is to offer a self-managed, affordable grocery store open to all, driving social transformation. We provide 
- gemini mission: To provide affordable, healthy food, combat food deserts, and foster social inclusion and collective self-management in 
- groq mission: To offer affordable, healthy food and promote collective self-management and social transformation.

**Theatre Aquarius** — prod location `Hamilton Township, ON`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Hamilton Township, ON | (from prod geo) | (from prod geo) |
| type | nonprofit | nonprofit | nonprofit |
| sector_id | arts-culture-information | arts-culture-information | arts-culture-information |
| sse_rating | strong_yes | strong_yes | strong_yes |
| website | theatreaquarius.org | theatreaquarius.org | theatreaquarius.org |
| is_sse | True | True | True |

- prod mission: To create outstanding, accessible live theatre that entertains, challenges, and educates, celebrating possibility, engag
- gemini mission: Dedicated to creating outstanding, accessible, live theatre that entertains, challenges, and educates.
- groq mission: Dedicated to creating outstanding, accessible, live theatre that entertains, challenges, and educates.

**CAFES (Community Action for Environmental Sustainability)** — prod location `Ottawa, ON`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Ottawa, ON | (from prod geo) | (from prod geo) |
| type | nonprofit | nonprofit | nonprofit |
| sector_id | environment-circular-economy | environment-circular-economy | environment-circular-economy |
| sse_rating | weak_yes | strong_yes | strong_yes |
| website | None | cafesottawa.ca | cafesottawa.ca |
| is_sse | True | True | True |

- prod mission: To advocate for environmental sustainability and promote environmental action and leadership in Ottawa through a members
- gemini mission: To support effective environmental action in the Ottawa community and at the municipal level to create and safeguard a m
- groq mission: CAFES supports effective environmental action in the local community to create a healthy and livable city.

**Scale Institute Society** — prod location ``

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location |  | (from prod geo) | (from prod geo) |
| type | nonprofit | nonprofit | nonprofit |
| sector_id | financial-insurance-services | community-civic-infrastructure | education-knowledge |
| sse_rating | weak_yes | strong_yes | strong_yes |
| website | None | scaleinstitute.ca | scaleinstitute.ca |
| is_sse | True | True | True |

- prod mission: The Impact Guarantee program aims to strengthen and grow Canada’s social finance sector by connecting capital providers 
- gemini mission: To conduct research and provide innovation, development, and educational programming for the social change sector, advan
- groq mission: Research and innovation for the social change sector, providing programming in social innovation, social enterprise, and

**Around the Block** — prod location `North York, ON`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | North York, ON | (from prod geo) | (from prod geo) |
| type | other | other | other |
| sector_id | retail-consumer-goods | retail-consumer-goods | retail-consumer-goods |
| sse_rating | no | no | no |
| website | aroundtheblock.com | aroundtheblock.com | aroundtheblock.com |
| is_sse | False | False | False |

- prod mission: —
- gemini mission: To provide quality consignment and resale services for curated home furnishings, decor, antiques, and vintage items in t
- groq mission: —

**Rio Tinto** — prod location `Montreal, QC`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Montreal, QC | (from prod geo) | (from prod geo) |
| type | other | other | other |
| sector_id | manufacturing-production | manufacturing-production | manufacturing-production |
| sse_rating | no | no | no |
| website | riotinto.com | riotinto.com | riotinto.com |
| is_sse | False | False | False |

- prod mission: To produce the materials essential to human progress by finding better ways to provide the metals and minerals the world
- gemini mission: Rio Tinto aims to be the world's most valued metals and mining business, finding better ways to provide the materials th
- groq mission: To become the world's most valued metals and mining business.

**Pomerleau** — prod location `Gatineau, QC`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Gatineau, QC | (from prod geo) | (from prod geo) |
| type | other | other | other |
| sector_id | community-civic-infrastructure | community-civic-infrastructure | manufacturing-production |
| sse_rating | weak_yes | no | no |
| website | pomerleau.ca | pomerleau.ca | pomerleau.ca |
| is_sse | True | False | False |

- prod mission: Pomerleau's vision is to be a Canadian leader in construction, at the forefront of innovation, working collaboratively a
- gemini mission: To deliver major construction and infrastructure projects that shape the Canadian landscape while creating a sustainable
- groq mission: Deliver major projects that shape the Canadian landscape and create a sustainable future.

**Atomic Energy of Canada Limited** — prod location `Chalk River, ON`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Chalk River, ON | (from prod geo) | (from prod geo) |
| type | government | government | None |
| sector_id | environment-circular-economy | environment-circular-economy | None |
| sse_rating | no | no | None |
| website | aecl.ca | aecl.ca | None |
| is_sse | False | False | None |

- prod mission: Driving nuclear innovation to deliver clean energy technologies and improve the quality of life of Canadians while carin
- gemini mission: Driving nuclear innovation to deliver clean energy technologies and improve the quality of life of Canadians while carin
- groq mission: —

**Norfolk County** — prod location `Simcoe, ON`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Simcoe, ON | (from prod geo) | (from prod geo) |
| type | government | government | None |
| sector_id | community-civic-infrastructure | community-civic-infrastructure | None |
| sse_rating | no | no | None |
| website | norfolkcounty.ca | norfolkcounty.ca | None |
| is_sse | False | False | None |

- prod mission: Norfolk County is dedicated to providing responsive municipal services, maintaining vital infrastructure, supporting loc
- gemini mission: To deliver municipal services, maintain public infrastructure, and support local community well-being through responsive
- groq mission: —

**Defence Construction Canada** — prod location `Quebec, QC`

| field | Prod | Gemini+T | Groq+T |
|---|---|---|---|
| location | Quebec, QC | (from prod geo) | (from prod geo) |
| type | government | government | None |
| sector_id | environment-circular-economy | environment-circular-economy | None |
| sse_rating | weak_yes | no | None |
| website | dcc-dcc.gc.ca | dcc-dcc.gc.ca | None |
| is_sse | True | False | None |

- prod mission: To provide timely, effective and efficient infrastructure and environment support services for the defence and security 
- gemini mission: To provide innovative and cost-effective contracting, construction contract management, infrastructure and environmental
- groq mission: —

## Jobs (10)

| Job | Prod | Gemini+T | Groq+T | vs prod / notes |
|---|---|---|---|---|
| Volunteer Positions @ EnviroCentre | `strong_yes/True` | `strong_yes/True` | `strong_yes/True` | gemini=prod; groq=prod |
| Toronto environmental organizations, Lea @ Toronto Environmental Alliance | `strong_yes/True` | `strong_yes/True` | `strong_yes/True` | gemini=prod; groq=prod |
| Job Opportunity @ Canadian Parks and Wilderness Society | Apply | `strong_yes/True` | `strong_yes/True` | `ERR: LLM provider error: All Groq models dail` | gemini=prod; groq err |
| Volunteer Positions @ Conservation Halton | `strong_yes/True` | `no/False` | `ERR: LLM provider error: All Groq models dail` | gemini: REGRESSION strong_yes→no; groq err |
| Non-profit Board Position @ Let's Hike T.O. | `strong_yes/True` | `strong_yes/True` | `ERR: LLM provider error: All Groq models dail` | gemini=prod; groq err |
| Account Manager – 1 Year Contract @ Evergreen | `weak_yes/True` | `no/False` | `ERR: LLM provider error: All Groq models dail` | gemini: REGRESSION weak_yes→no; groq err |
| Outdoor education, Nature play, Forest s @ Roots 2 Rise Outdoors | `weak_yes/True` | `strong_yes/True` | `ERR: LLM provider error: All Groq models dail` | gemini≠prod:sse_rating (weak_yes→strong_yes); groq err |
| Technician @ Cambium | `weak_yes/False` | `no/False` | `ERR: LLM provider error: All Groq models dail` | gemini≠prod:sse_rating (weak_yes→no); groq err |
| Organic veggie farming @ Selva Farm | `weak_yes/False` | `no/False` | `ERR: LLM provider error: All Groq models dail` | gemini≠prod:sse_rating (weak_yes→no); groq err |
| Strategic Planning Consultant (Request F @ Evergreen | `no/True` | `strong_yes/True` | `ERR: LLM provider error: All Groq models dail` | gemini≠prod:sse_rating (no→strong_yes); groq err |

### Job reasoning snippets

**Volunteer Positions @ EnviroCentre**
- gemini: EnviroCentre is an environmental non-profit organization offering transparently disclosed volunteer opportunities to support home energy affordability programs for underserved hous
- groq: EnviroCentre is a nonprofit with a clear mission to support residents and communities in reducing their environmental impact.

**Toronto environmental organizations, Lea @ Toronto Environmental Alliance**
- gemini: The Toronto Environmental Alliance is a long-standing non-profit environmental advocacy organization. The Executive Director role directly advances community-based environmental ju
- groq: The Toronto Environmental Alliance is a nonprofit organization with a clear mission to promote a greener Toronto, prioritizing people and the environment. The Executive Director ro

**Job Opportunity @ Canadian Parks and Wilderness Society | Apply**
- gemini: The Canadian Parks and Wilderness Society is a registered environmental charity working to protect public lands and waters in alignment with reconciliation and ecological goals. Th
- groq: LLM provider error: All Groq models daily quota exhausted: {"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_01kk16tfryfktr3b2hpypv18

**Volunteer Positions @ Conservation Halton**
- gemini: Conservation Halton is a public-sector conservation authority established under Ontario provincial legislation. Under the automatic no flags criteria, government and public-sector 
- groq: LLM provider error: All Groq models daily quota exhausted: {"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_01kk16tfryfktr3b2hpypv18

**Non-profit Board Position @ Let's Hike T.O.**
- gemini: Let's Hike T.O. is a volunteer-run non-profit dedicated to diversifying outdoor recreation and fostering community equity. The Board Chair position is transparently disclosed as an
- groq: LLM provider error: All Groq models daily quota exhausted: {"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_01kk16tfryfktr3b2hpypv18

**Account Manager – 1 Year Contract @ Evergreen**
- gemini: The hiring employer is Principles (withprinciples.com), a marketing and creative agency serving the nonprofit sector. Because this is a conventional for-profit agency rather than a
- groq: LLM provider error: All Groq models daily quota exhausted: {"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_01kk16tfryfktr3b2hpypv18

**Outdoor education, Nature play, Forest s @ Roots 2 Rise Outdoors**
- gemini: Roots 2 Rise Outdoors offers nature-based exploratory education prioritizing ecological connection and whole-child development over profit. The role operates within a community-foc
- groq: LLM provider error: All Groq models daily quota exhausted: {"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_01kk16tfryfktr3b2hpypv18

**Technician @ Cambium**
- gemini: Cambium Inc. is a conventional for-profit consulting and engineering firm. According to the automated evaluation rules, traditional private-sector consultancies and engineering fir
- groq: LLM provider error: All Groq models daily quota exhausted: {"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_01kk16tfryfktr3b2hpypv18

**Organic veggie farming @ Selva Farm**
- gemini: Selva Farms is a small-scale organic farm operating as a commercial farm enterprise rather than a cooperative, nonprofit, or registered solidarity structure. While it utilizes rege
- groq: LLM provider error: All Groq models daily quota exhausted: {"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_01kk16tfryfktr3b2hpypv18

**Strategic Planning Consultant (Request F @ Evergreen**
- gemini: The Hamilton Community Foundation is a registered community foundation supporting philanthropic and social impact initiatives. This Request for Proposal seeks a consultant to guide
- groq: LLM provider error: All Groq models daily quota exhausted: {"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_01kk16tfryfktr3b2hpypv18

## Match rates

### Provider ↔ prod (orgs)

| Provider | overall | type | sector_id | sse_rating | website | is_sse |
|---|---|---|---|---|---|---|
| gemini+tav | 82.0% | 100.0% (10/10) | 90.0% (9/10) | 60.0% (6/10) | 80.0% (8/10) | 80.0% (8/10) |
| groq+tav | 77.1% | 100.0% (7/7) | 71.4% (5/7) | 57.1% (4/7) | 71.4% (5/7) | 85.7% (6/7) |

### Provider ↔ gemini (orgs)

| Provider | overall | type | sector_id | sse_rating | website | is_sse |
|---|---|---|---|---|---|---|
| groq+tav | 94.3% | 100.0% (7/7) | 71.4% (5/7) | 100.0% (7/7) | 100.0% (7/7) | 100.0% (7/7) |

### Provider ↔ prod (jobs)

| Provider | overall | sse_rating | is_sse |
|---|---|---|---|
| gemini+tav | 60.0% | 40.0% (4/10) | 80.0% (8/10) |
| groq+tav | 100.0% | 100.0% (2/2) | 100.0% (2/2) |

### Provider ↔ gemini (jobs)

| Provider | overall | sse_rating | is_sse |
|---|---|---|---|
| groq+tav | 100.0% | 100.0% (2/2) | 100.0% (2/2) |

## Analysis

### Completeness caveat

Gemini is complete (20/20). Groq missing: orgs AECL, Norfolk County, Defence Construction Canada; jobs CPAWS, Conservation Halton, Let's Hike T.O., Evergreen Account Manager, Roots 2 Rise, Cambium, Selva Farm, Evergreen Strategic Planning RFP. Match rates below for Groq use only successful calls (orgs n=7, jobs n=2).

### 1. Match rates (summary)

- **Gemini+T ↔ prod**: orgs 82.0%, jobs 60.0%.
- **Groq+T ↔ prod**: orgs 77.1% (n=7), jobs 100.0% (n=2 — incomplete).
- **Groq+T ↔ Gemini+T** (structural): orgs 94.3% (n=7), jobs 100.0% (n=2).
- **is_sse only** — Gemini orgs 80.0% (8/10), Groq orgs 85.7% (6/7); Gemini jobs 80.0% (8/10), Groq jobs 100.0% (2/2).

### 2. Where Tavily improves on prod

- **For-profit / retail correctly `no`**: Around the Block, Rio Tinto — both providers (where run).
- **Gov correctly `no`**: AECL, Norfolk County (Gemini); matches prod.
- **Likely prod over-calls flipped to `no` (improvement, labeled REGRESSION vs prod label)**:
  - **Pomerleau** (construction for-profit, prod `weak_yes`) → Gemini+Groq `no` — correct for-profit hold.
  - **Defence Construction Canada** (federal crown, prod `weak_yes`) → Gemini `no` — aligns with gov auto-no.
  - **Conservation Halton** (conservation authority / public sector, prod `strong_yes`) → Gemini `no` with explicit public-sector reasoning.
  - **Cambium / Selva Farm** (prod `weak_yes` but `is_sse=False` inconsistent) → Gemini `no` — cleans polarity.
- **CAFES / Scale Institute**: both providers upgrade `weak_yes`→`strong_yes` and discover websites (`cafesottawa.ca`, `scaleinstitute.ca`) where prod had none — strength upgrade, polarity same.
- **Roots 2 Rise**: Gemini `weak_yes`→`strong_yes` (still SSE).

### 3. Where Tavily regresses vs prod (or is risky)

- **Evergreen Account Manager**: Gemini says employer is **Principles** (for-profit agency) → `no`. If the true employer is Evergreen nonprofit, this is a **regression / mis-attribution** from listing/Tavily noise.
- **Evergreen Strategic Planning RFP**: prod `no`/`is_sse=True` (inconsistent). Gemini → `strong_yes` citing **Hamilton Community Foundation**. If the RFP is really for HCF via Evergreen posting, this may be an improvement; if scraped under wrong org name, it's attribution drift.
- Exact-rating mismatches without polarity change (CAFES/Scale `weak`→`strong`) are not polarity regressions.

### 4. Groq vs Gemini remaining disagreements

On the 7 orgs both completed: **sse_rating / is_sse / type / website all match**. Only **sector_id** differs:
- Scale Institute: Gemini `community-civic-infrastructure` vs Groq `education-knowledge` (prod was `financial-insurance-services`).
- Pomerleau: Gemini `community-civic-infrastructure` vs Groq `manufacturing-production`.

No Groq↔Gemini job disagreements on the 2 completed jobs.

### 5. Website stick rate

- Gemini kept prod website host on **100.0%** (8/8) of orgs that had a prod website; also filled CAFES + Scale where prod was null.
- Groq kept prod website host on **100.0%** (5/5 completed with known prod site).

### 6. Overall verdict

**Gemini+Tavily (complete sample): as good or better than prod baselines on SSE polarity**, especially for-profit/gov `no` and cleaning prod over-calls / inconsistent `weak_yes`+`is_sse=False` jobs. Watch thin job postings for employer mis-attribution.

**Groq+Tavily (partial): quality matches Gemini where finished (94% structural org agree)** — do not treat jobs 100% as evidence until the 8 missing job + 3 org Groq calls complete after TPD reset.
