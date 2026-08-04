# Tavily-always job parity: Groq vs prod vs Gemini (10 jobs)

Generated: `2026-08-03T15:26:55.436221+00:00`

Same 10 jobs as Gemini+Tavily batches A+B (`scripts/tavily_job_parity_5_gemini.md`, `scripts/tavily_job_parity_5_gemini_b.md`), re-run with **Groq + Tavily**.

## Setup

- **SSE chain:** `groq` (Groq-only confirmed: `True`)
- **`GEMINI_API_KEY` in process:** `False` (was present in .env before unset: `True`)
- **`CEREBRAS_API_KEY` in process:** `False` (was present before unset: `True`)
- **`USE_GOOGLE_SEARCH_GROUNDING`:** `False` — **off (expected)**; Tavily replaces Gemini-native Google Search grounding.
- **Tavily available:** `True`
- Mode: force `use_grounding=True` + employer search query (tavily-always); dry-run only — **no DB writes**.

## Headline rates

- **Groq vs prod:** rating `6/10` (60%) · is_sse `8/10` (80%) · both `6/10` (60%)
- **Groq vs Gemini:** rating `8/10` (80%) · is_sse `8/10` (80%) · both `8/10` (80%)
- **Gemini vs prod (prior):** rating `6/10` (60%) · is_sse `6/10` (60%) · both `5/10` (50%) — reminder: prior A+B was **6/10** rating.

**Groq↔prod rating **6/10** · Groq↔Gemini rating **8/10** · Gemini↔prod rating **6/10** (prior 6/10).**

## Summary table

| # | Batch | Job | Org | Prod rating / is_sse | Gemini+T | Groq+T | G↔prod | Gr↔prod | Gr↔Gem | Provider | Elapsed |
|---|-------|-----|-----|----------------------|----------|--------|--------|---------|--------|----------|---------|
| 1 | A | Communications and Design Coordinato... | The New Farm Centre For Clim... | `strong_yes` / yes | `strong_yes` / yes | `strong_yes` / yes | yes | yes | yes | `groq` | 1.38s |
| 2 | A | Lands, Waters and Consultation Coord... | Historic Saugeen Métis | `strong_yes` / yes | `strong_yes` / yes | `strong_yes` / yes | yes | yes | yes | `groq` | 1.06s |
| 3 | A | Summer jobs, Student jobs | Georgian Bay Land Trust | `strong_yes` / yes | `strong_yes` / yes | `strong_yes` / yes | yes | yes | yes | `groq` | 1.06s |
| 4 | A | Toronto outdoors, Summer camps | Toronto Island SUP (TISUP) | `weak_yes` / yes | `no` / NO | `no` / NO | NO | NO | yes | `groq` | 1.28s |
| 5 | A | Algonquin Park Canoe Trip Guides 202... | Voyageur Quest | `weak_yes` / yes | `no` / NO | `no` / NO | NO | NO | yes | `groq` | 1.02s |
| 6 | B | Administrative Assistant | Toronto Wildlife Centre | `strong_yes` / yes | `strong_yes` / yes | `strong_yes` / yes | yes | yes | yes | `groq` | 1.22s |
| 7 | B | Good Food and Community | Persephone Market Garden | `weak_yes` / yes | `no` / NO | `weak_yes` / yes | NO | yes | NO | `groq` | 4.71s |
| 8 | B | Field and Community Biologist | Turtle Guardians (of The Lan... | `no` / yes | `no` / NO | `strong_yes` / yes | NO | NO | NO | `groq` | 4.39s |
| 9 | B | Urban forestry, ecology, arboricultu... | City of Mississauga | `strong_yes` / NO | `no` / NO | `no` / NO | NO | NO | yes | `groq` | 11.19s |
| 10 | B | HR & Admin Coordinator | Toronto Renewable Energy Co-... | `strong_yes` / yes | `strong_yes` / yes | `strong_yes` / yes | yes | yes | yes | `groq` | 8.42s |

Match flags are **both** `sse_rating` + `is_sse` (structural).

## Verdict

Yes — Groq+Tavily is about as consistent as Gemini+Tavily: high agreement with Gemini (8/10 both) and similar prod rating match (6/10 vs Gemini's 6/10). Groq completions: 10/10; errors: 0. Providers used: ['groq', 'groq', 'groq', 'groq', 'groq', 'groq', 'groq', 'groq', 'groq', 'groq'].

### Notable flips

- **groq≠gemini** — Good Food and Community @ Persephone Market Garden: gemini=`no`/False → groq=`weak_yes`/True (prod=`weak_yes`/True)
- **groq≠gemini** — Field and Community Biologist @ Turtle Guardians (of The Land Between charity): gemini=`no`/False → groq=`strong_yes`/True (prod=`no`/True)

## Per-job detail

## Job 1: `ba1492a7-32b8-46e4-bae2-ca5877cf5c83` (batch A)

- **Title:** Communications and Design Coordinator
- **Org:** The New Farm Centre For Climate Change (org_type=`None`)
- **Baseline quality (prior):** strong

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `strong_yes` | `strong_yes` | `strong_yes` |
| `is_sse` | `True` | `True` | `True` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`True` · groq↔gemini=`True` · gemini↔prod=`True` (rating-only: gr↔prod=`True` · gr↔gem=`True`)
- **Groq reasoning:** The New Farm Centre is a registered charity with a clear mission to develop and advocate for regenerative farming systems, mitigating climate change and fostering healthy ecosystems. The role of Communications and Design Coordinator contributes to this mission by promoting the organization's work and values. The organization's commitment to social and environmental good is evident in its programs and partnerships.
- **Tavily hosts:** instagram.com, linkedin.com, onthebaymagazine.com, pivotandgrow.com, regenerationcanada.org (4492 chars)

## Job 2: `3b2ae1df-f5ce-4a6c-9636-76ffcb14c903` (batch A)

- **Title:** Lands, Waters and Consultation Coordinator
- **Org:** Historic Saugeen Métis (org_type=`other`)
- **Baseline quality (prior):** strong

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `strong_yes` | `strong_yes` | `strong_yes` |
| `is_sse` | `True` | `True` | `True` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`True` · groq↔gemini=`True` · gemini↔prod=`True` (rating-only: gr↔prod=`True` · gr↔gem=`True`)
- **Groq reasoning:** Historic Saugeen Métis is a nonprofit community organization with a clear mission prioritizing environmental stewardship and Indigenous rights. The role contributes to social and environmental good, and the organization's governance is rooted in community representation and collective decision-making.
- **Tavily hosts:** brucecounty.on.ca, hdp-ca-prod-app-saug-engage-files.s3.ca-central-1.amazonaws.com, planthebruce.ca, saugeenmetis.com (3744 chars)

## Job 3: `352163a0-40a7-4b72-aecf-9a98035f334f` (batch A)

- **Title:** Summer jobs, Student jobs
- **Org:** Georgian Bay Land Trust (org_type=`nonprofit`)
- **Baseline quality (prior):** strong

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `strong_yes` | `strong_yes` | `strong_yes` |
| `is_sse` | `True` | `True` | `True` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`True` · groq↔gemini=`True` · gemini↔prod=`True` (rating-only: gr↔prod=`True` · gr↔gem=`True`)
- **Groq reasoning:** Georgian Bay Land Trust is a registered charity with a clear mission to protect wilderness lands and species, and the role contributes to this social and environmental good. The organization's governance and values align with Solidarity Economy principles, prioritizing people and the planet over profit.
- **Tavily hosts:** clementine-sapphire-3hnw.squarespace.com, facebook.com, gblt.org, gbtownship.ca, myparrysoundnow.com (2877 chars)

## Job 4: `9bdba800-f5f3-4e5d-b04d-b94206381125` (batch A)

- **Title:** Toronto outdoors, Summer camps
- **Org:** Toronto Island SUP (TISUP) (org_type=`None`)
- **Baseline quality (prior):** strong

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `weak_yes` | `no` | `no` |
| `is_sse` | `True` | `False` | `False` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`False` · groq↔gemini=`True` · gemini↔prod=`False` (rating-only: gr↔prod=`False` · gr↔gem=`True`)
- **Groq reasoning:** Toronto Island SUP is a for-profit business, and the job posting does not indicate a nonprofit or cooperative governance structure.
- **Tavily hosts:** instagram.com, toronto.ca, torontoisland.com, torontoislandsup.com, tripadvisor.com (4129 chars)

## Job 5: `afd79cf6-d699-4b59-86c4-68da2d3b28dc` (batch A)

- **Title:** Algonquin Park Canoe Trip Guides 2026
- **Org:** Voyageur Quest (org_type=`other`)
- **Baseline quality (prior):** strong

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `weak_yes` | `no` | `no` |
| `is_sse` | `True` | `False` | `False` |
| provider | — | `gemini-3.5-flash-lite` | `groq` |

- **Match flags:** groq↔prod=`False` · groq↔gemini=`True` · gemini↔prod=`False` (rating-only: gr↔prod=`False` · gr↔gem=`True`)
- **Groq reasoning:** Voyageur Quest is a conventional for-profit wilderness tour company, not a nonprofit, cooperative, or community association.
- **Tavily hosts:** facebook.com, voyageuroutfitting.com, voyageurquest.com (3673 chars)

## Job 6: `96f648a9-fe36-4f6f-8118-0212deb1f98a` (batch B)

- **Title:** Administrative Assistant
- **Org:** Toronto Wildlife Centre (org_type=`None`)
- **Baseline quality (prior):** placeholder

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `strong_yes` | `strong_yes` | `strong_yes` |
| `is_sse` | `True` | `True` | `True` |
| provider | — | `gemini-3.5-flash-lite` | `groq` |

- **Match flags:** groq↔prod=`True` · groq↔gemini=`True` · gemini↔prod=`True` (rating-only: gr↔prod=`True` · gr↔gem=`True`)
- **Groq reasoning:** Toronto Wildlife Centre is a registered charity with a clear mission to rescue and rehabilitate native wildlife, and the role of Administrative Assistant supports this mission. The organization's values and governance structure align with Solidarity Economy principles, prioritizing people and the environment over profit.
- **Tavily hosts:** canada.ca, facebook.com, iaac-aeic.gc.ca, torontowildlifecentre.com (1962 chars)

## Job 7: `fb4a51bc-f3d0-4752-919d-cb52cad70d0e` (batch B)

- **Title:** Good Food and Community
- **Org:** Persephone Market Garden (org_type=`None`)
- **Baseline quality (prior):** placeholder

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `weak_yes` | `no` | `weak_yes` |
| `is_sse` | `True` | `False` | `True` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`True` · groq↔gemini=`False` · gemini↔prod=`False` (rating-only: gr↔prod=`True` · gr↔gem=`False`)
- **Groq reasoning:** Persephone Market Garden is a small-scale farm prioritizing community and nature, with a clear mission and values. The role contributes to social and environmental good, with transparent compensation and clear job expectations.
- **Tavily hosts:** destinationsouthbrucepeninsula.com, facebook.com, greysauble.on.ca, visitbrucepeninsula.ca, visitlionshead.ca (4500 chars)

## Job 8: `279e6095-d080-4a54-92c8-39b4f41284dd` (batch B)

- **Title:** Field and Community Biologist
- **Org:** Turtle Guardians (of The Land Between charity) (org_type=`nonprofit`)
- **Baseline quality (prior):** placeholder

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `no` | `no` | `strong_yes` |
| `is_sse` | `True` | `False` | `True` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`False` · groq↔gemini=`False` · gemini↔prod=`False` (rating-only: gr↔prod=`False` · gr↔gem=`False`)
- **Groq reasoning:** Turtle Guardians is a registered national charity with a clear mission to conserve turtles and their habitats. The role of Field and Community Biologist contributes to social and environmental good by supporting turtle conservation efforts.
- **Tavily hosts:** ca.linkedin.com, facebook.com, kawarthanow.com, thelandbetween.ca, turtleguardians.com (2593 chars)

## Job 9: `2d432887-86be-4527-b5a4-e2226ed5bebd` (batch B)

- **Title:** Urban forestry, ecology, arboriculture, environmental science
- **Org:** City of Mississauga (org_type=`government`)
- **Baseline quality (prior):** placeholder

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `strong_yes` | `no` | `no` |
| `is_sse` | `False` | `False` | `False` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`False` · groq↔gemini=`True` · gemini↔prod=`False` (rating-only: gr↔prod=`False` · gr↔gem=`True`)
- **Groq reasoning:** The employer is a government/public-sector organization, which is not eligible for a Solidarity Economy alignment.
- **Tavily hosts:** ca.linkedin.com, en.wikipedia.org, mississauga.ca (4489 chars)

## Job 10: `8ff9113e-d388-4139-ae75-386f89276598` (batch B)

- **Title:** HR & Admin Coordinator
- **Org:** Toronto Renewable Energy Co-operative / Tapestry Community Capital (org_type=`None`)
- **Baseline quality (prior):** placeholder

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `strong_yes` | `strong_yes` | `strong_yes` |
| `is_sse` | `True` | `True` | `True` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`True` · groq↔gemini=`True` · gemini↔prod=`True` (rating-only: gr↔prod=`True` · gr↔gem=`True`)
- **Groq reasoning:** Tapestry Community Capital is a nonprofit organization that supports community investment, prioritizing people and the planet. The role of HR & Admin Coordinator contributes to social and community good, with a clear mission and values alignment.
- **Tavily hosts:** ca.linkedin.com, goodwork.ca, tapestry.com, tapestrycapital.ca (4443 chars)

## Failures / infra

- None observed.

Log: `/tmp/tavily_job_parity_10_groq.log`
JSON: `/Users/ry/code/wev/wev-scraper/scripts/tavily_job_parity_10_groq.json`
Script: `/Users/ry/code/wev/wev-scraper/scripts/tavily_job_parity_10_groq.py`

