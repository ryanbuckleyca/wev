# Tavily-always job parity retest: Groq vs Gemini vs prod (10 jobs)

Generated: `2026-08-03T17:09:48.220691+00:00`

Re-run after prompt/guard tighten + anonymize. Same 10 jobs as `scripts/tavily_job_parity_10_groq_v2` / Gemini A+B. **Both** Gemini+Tavily and Groq+Tavily re-classified (dry-run).

## Setup

- **Gemini pass chain:** `gemini-3.6-flash → gemini-3.5-flash-lite → groq → cerebras` (gemini-first: `True`)
- **Groq pass chain:** `groq` (groq-only: `True`)
- **`USE_GOOGLE_SEARCH_GROUNDING`:** `False` — **off (expected)**; Tavily replaces Gemini-native Google Search grounding.
- **Tavily available:** `True`
- Mode: force `use_grounding=True` + employer search query (tavily-always); dry-run only — **no DB writes**.
- **Prompt anonymity:** `OK` (named-org hits: none)

## Headline rates

- **Groq vs prod:** rating `7/10` (70%) · is_sse `7/10` (70%) · both `6/10` (60%)
- **Groq vs Gemini:** rating `9/10` (90%) · is_sse `9/10` (90%) · both `9/10` (90%)
- **Gemini vs prod:** rating `6/10` (60%) · is_sse `6/10` (60%) · both `5/10` (50%)

**Groq↔prod rating **7/10** · Groq↔Gemini rating **9/10** · Gemini↔prod rating **6/10** (v2 was 6/10 · 10/10 · 6/10).**

### vs prior v2

- Prior Groq↔Gemini rating: `10/10` → now `9/10`
- Prior Groq↔prod rating: `6/10` → now `7/10`
- Prior Gemini↔prod rating: `6/10` → now `6/10`

## Summary table

| # | Batch | Job | Org | Prod rating / is_sse | Gemini+T | Groq+T | G↔prod | Gr↔prod | Gr↔Gem | Gem provider | Groq provider | Elapsed G/Gr |
|---|-------|-----|-----|----------------------|----------|--------|--------|---------|--------|--------------|---------------|--------------|
| 1 | A | Communications and Design Coordinato... | The New Farm Centre For Clim... | `strong_yes` / yes | `strong_yes` / yes | `strong_yes` / yes | yes | yes | yes | `gemini-3.5-flash-lite` | `groq` | 71.31/2.09s |
| 2 | A | Lands, Waters and Consultation Coord... | Historic Saugeen Métis | `strong_yes` / yes | `strong_yes` / yes | `strong_yes` / yes | yes | yes | yes | `gemini-3.6-flash` | `groq` | 19.64/1.84s |
| 3 | A | Summer jobs, Student jobs | Georgian Bay Land Trust | `strong_yes` / yes | `strong_yes` / yes | `strong_yes` / yes | yes | yes | yes | `gemini-3.6-flash` | `groq` | 12.56/2.31s |
| 4 | A | Toronto outdoors, Summer camps | Toronto Island SUP (TISUP) | `weak_yes` / yes | `no` / NO | `no` / NO | NO | NO | yes | `gemini-3.6-flash` | `groq` | 7.56/1.06s |
| 5 | A | Algonquin Park Canoe Trip Guides 202... | Voyageur Quest | `weak_yes` / yes | `no` / NO | `weak_yes` / yes | NO | yes | NO | `gemini-3.6-flash` | `groq` | 8.11/1.55s |
| 6 | B | Administrative Assistant | Toronto Wildlife Centre | `strong_yes` / yes | `strong_yes` / yes | `strong_yes` / yes | yes | yes | yes | `gemini-3.6-flash` | `groq` | 17.71/28.87s |
| 7 | B | Good Food and Community | Persephone Market Garden | `weak_yes` / yes | `no` / NO | `no` / NO | NO | NO | yes | `gemini-3.6-flash` | `groq` | 14.49/27.39s |
| 8 | B | Field and Community Biologist | Turtle Guardians (of The Lan... | `no` / yes | `no` / NO | `no` / NO | NO | NO | yes | `gemini-3.6-flash` | `groq` | 14.06/30.67s |
| 9 | B | Urban forestry, ecology, arboricultu... | City of Mississauga | `strong_yes` / NO | `no` / NO | `no` / NO | NO | NO | yes | `gemini-3.6-flash` | `groq` | 15.52/38.02s |
| 10 | B | HR & Admin Coordinator | Toronto Renewable Energy Co-... | `strong_yes` / yes | `strong_yes` / yes | `strong_yes` / yes | yes | yes | yes | `gemini-3.6-flash` | `groq` | 9.11/34.28s |

Match flags are **both** `sse_rating` + `is_sse` (structural).

## Verdict

Yes — Groq+Tavily stays consistent with Gemini+Tavily: agreement `9/10` both; prod rating match Groq `7/10` vs Gemini `6/10`. Gemini completions: 10/10; Groq completions: 10/10. Gemini providers: ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.6-flash']. Groq providers: ['groq', 'groq', 'groq', 'groq', 'groq', 'groq', 'groq', 'groq', 'groq', 'groq']. Prompt anonymity: OK.

### Notable flips / regressions

- **groq≠gemini** — Algonquin Park Canoe Trip Guides 2026 @ Voyageur Quest: gemini=`no`/False → groq=`weak_yes`/True (prod=`weak_yes`/True)
- **REGRESSION vs v2 target** — Groq↔Gemini rating was 10/10, now 9/10

## Per-job detail

## Job 1: `ba1492a7-32b8-46e4-bae2-ca5877cf5c83` (batch A)

- **Title:** Communications and Design Coordinator
- **Org:** The New Farm Centre For Climate Change (org_type=`None`)
- **Baseline quality (prior):** strong

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `strong_yes` | `strong_yes` | `strong_yes` |
| `is_sse` | `True` | `True` | `True` |
| provider | — | `gemini-3.5-flash-lite` | `groq` |

- **Match flags:** groq↔prod=`True` · groq↔gemini=`True` · gemini↔prod=`True` (rating-only: gr↔prod=`True` · gr↔gem=`True`)
- **Gemini reasoning:** The New Farm Centre is a registered charity dedicated to regenerative farming, food security, and climate advocacy. The role offers transparent compensation ($32-$40/hour plus benefits) and directly contributes to environmental and community goals.
- **Gemini Tavily hosts:** canadahelps.org, instagram.com, linkedin.com, onthebaymagazine.com, pivotandgrow.com (4497 chars)
- **Groq reasoning:** The New Farm Centre is a registered charity with a clear mission to develop and advocate for regenerative farming systems, mitigating climate change and fostering healthy ecosystems. The role of Communications and Design Coordinator contributes to this mission by promoting regenerative practices and supporting resilient food systems. Transparent compensation is provided, with a pay range of $32-40 per hour.
- **Groq Tavily hosts:** canadahelps.org, instagram.com, linkedin.com, onthebaymagazine.com, pivotandgrow.com (4497 chars)

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
- **Gemini reasoning:** Historic Saugeen Métis is an Indigenous community organization governed by an elected Council dedicated to environmental stewardship and collective rights. The role directly advances environmental protection, consultation, and land stewardship for the community. Compensation is fully transparent at $37-$42/hr with flexible scheduling and professional development.
- **Gemini Tavily hosts:** hdp-ca-prod-app-saug-engage-files.s3.ca-central-1.amazonaws.com, joshswaterjobs.com, planthebruce.ca, saugeenmetis.com, visitsouthampton.ca (4498 chars)
- **Groq reasoning:** Historic Saugeen Métis is a community-driven organization with a clear social and environmental mission, governed by an elected Council. The Lands, Waters and Consultation Coordinator role contributes to environmental stewardship and community interests. Compensation is transparent, with a rate commensurate with experience.
- **Groq Tavily hosts:** hdp-ca-prod-app-saug-engage-files.s3.ca-central-1.amazonaws.com, joshswaterjobs.com, planthebruce.ca, saugeenmetis.com, visitsouthampton.ca (4498 chars)

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
- **Gemini reasoning:** Georgian Bay Land Trust is a registered charitable land trust dedicated to protecting wilderness lands and species along Georgian Bay. The Summer Outreach Student role engages local communities in environmental stewardship and education, directly supporting the organization's conservation mission. Transparent compensation ($21/hr) and clear job expectations are provided.
- **Gemini Tavily hosts:** ca.linkedin.com, causes.benevity.org, escarpmentmagazine.ca, gblt.org, gohomebay.org (4499 chars)
- **Groq reasoning:** Georgian Bay Land Trust is a nonprofit organization with a clear mission to protect wilderness lands and species. The role contributes to social/community/environmental good and has transparent compensation. The organization's governance model is stated as a charitable organization.
- **Groq Tavily hosts:** ca.linkedin.com, causes.benevity.org, escarpmentmagazine.ca, gblt.org, gohomebay.org (4499 chars)

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
- **Gemini reasoning:** Toronto Island SUP is a conventional for-profit outdoor recreation and rental business, failing the governance gate required for Solidarity Economy alignment. Furthermore, the job posting lacks transparent pay disclosure, stating compensation will only be discussed during the interview process.
- **Gemini Tavily hosts:** perfectpaddles.com, toronto.ca, torontoisland.com, torontoislandsup.com, youtube.com (4500 chars)
- **Groq reasoning:** Toronto Island SUP is a for-profit business, and the job posting lacks transparent compensation information.
- **Groq Tavily hosts:** perfectpaddles.com, toronto.ca, torontoisland.com, torontoislandsup.com, youtube.com (4500 chars)

## Job 5: `afd79cf6-d699-4b59-86c4-68da2d3b28dc` (batch A)

- **Title:** Algonquin Park Canoe Trip Guides 2026
- **Org:** Voyageur Quest (org_type=`other`)
- **Baseline quality (prior):** strong

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `weak_yes` | `no` | `weak_yes` |
| `is_sse` | `True` | `False` | `True` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`True` · groq↔gemini=`False` · gemini↔prod=`False` (rating-only: gr↔prod=`True` · gr↔gem=`False`)
- **Gemini reasoning:** Voyageur Quest is a private, commercial wilderness tour and outfitting company. Although the role focuses on outdoor leadership, nature interpretation, and wilderness skills, conventional for-profit businesses fail the governance gate required for Solidarity Economy alignment.
- **Gemini Tavily hosts:** voyageuroutfitting.com, voyageurquest.com (4500 chars)
- **Groq reasoning:** Voyageur Quest is a wilderness tour company with a clear mission to create unforgettable adventures in Algonquin Park. The role of Canoe Guide contributes to social and environmental good. However, the employer's governance model is not explicitly stated as a nonprofit or cooperative.
- **Groq Tavily hosts:** voyageuroutfitting.com, voyageurquest.com (4500 chars)

## Job 6: `96f648a9-fe36-4f6f-8118-0212deb1f98a` (batch B)

- **Title:** Administrative Assistant
- **Org:** Toronto Wildlife Centre (org_type=`None`)
- **Baseline quality (prior):** placeholder

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `strong_yes` | `strong_yes` | `strong_yes` |
| `is_sse` | `True` | `True` | `True` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`True` · groq↔gemini=`True` · gemini↔prod=`True` (rating-only: gr↔prod=`True` · gr↔gem=`True`)
- **Gemini reasoning:** Toronto Wildlife Centre is a registered charity dedicated to wildlife rescue, rehabilitation, and public education. The role includes clear operational expectations and transparent compensation ($19.00–$22.00/hr). As an administrative role supporting charity operations, it directly contributes to an organization advancing environmental care and animal welfare.
- **Gemini Tavily hosts:** goodwork.ca, iaac-aeic.gc.ca, torontowildlifecentre.com, urbantoronto.ca (4333 chars)
- **Groq reasoning:** Toronto Wildlife Centre is a registered charity with a clear mission to provide rescue, medical care, and rehabilitation to sick, injured, and orphaned native wildlife. The role of Administrative Assistant contributes to this mission by providing administrative and operational support. The employer's governance model is a nonprofit, and compensation is transparent.
- **Groq Tavily hosts:** goodwork.ca, iaac-aeic.gc.ca, torontowildlifecentre.com, urbantoronto.ca (4333 chars)

## Job 7: `fb4a51bc-f3d0-4752-919d-cb52cad70d0e` (batch B)

- **Title:** Good Food and Community
- **Org:** Persephone Market Garden (org_type=`None`)
- **Baseline quality (prior):** placeholder

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `weak_yes` | `no` | `no` |
| `is_sse` | `True` | `False` | `False` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`False` · groq↔gemini=`True` · gemini↔prod=`False` (rating-only: gr↔prod=`False` · gr↔gem=`True`)
- **Gemini reasoning:** Persephone Market Garden is a privately owned family farm and market garden. Despite adopting organic, no-till practices and a CSA model, private commercial farms without non-profit or cooperative governance fail the hard governance gate for Solidarity Economy alignment.
- **Gemini Tavily hosts:** brucepeninsulapress.com, persephonemarketgarden.ca (2768 chars)
- **Groq reasoning:** Persephone Market Garden is a privately owned farm without clear nonprofit, cooperative, or mutual governance evidence, and the role is not explicitly disclosed as volunteer or internship.
- **Groq Tavily hosts:** brucepeninsulapress.com, persephonemarketgarden.ca (2768 chars)

## Job 8: `279e6095-d080-4a54-92c8-39b4f41284dd` (batch B)

- **Title:** Field and Community Biologist
- **Org:** Turtle Guardians (of The Land Between charity) (org_type=`nonprofit`)
- **Baseline quality (prior):** placeholder

| Field | Prod | Gemini+Tavily | Groq+Tavily |
|-------|------|---------------|-------------|
| `sse_rating` | `no` | `no` | `no` |
| `is_sse` | `True` | `False` | `False` |
| provider | — | `gemini-3.6-flash` | `groq` |

- **Match flags:** groq↔prod=`False` · groq↔gemini=`True` · gemini↔prod=`False` (rating-only: gr↔prod=`True` · gr↔gem=`True`)
- **Gemini reasoning:** Although Turtle Guardians is operated by a registered charity (The Land Between) with a clear environmental conservation mission, the job posting lacks transparent compensation details and is not explicitly designated as a volunteer or internship role. Under the strict evaluation criteria, missing pay transparency triggers an automatic non-alignment rating.
- **Gemini Tavily hosts:** conserveturtles.org, doi.gov, en.wikipedia.org, massaudubon.org, turtlesurvival.org (4500 chars)
- **Groq reasoning:** Turtle Guardians is a registered charity with a clear mission to protect turtles and their habitats. The role of Field and Community Biologist contributes to this mission, and the employer provides a transparent volunteer opportunity.
- **Groq Tavily hosts:** conserveturtles.org, doi.gov, en.wikipedia.org, massaudubon.org, turtlesurvival.org (4500 chars)

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
- **Gemini reasoning:** The hiring employer is the City of Mississauga, a municipal government entity. Public-sector and municipal government employers are automatically excluded from the Solidarity Economy framework, which requires autonomous, community-controlled, cooperative, or non-profit governance.
- **Gemini Tavily hosts:** ca.linkedin.com, en.wikipedia.org, mississauga.ca (4500 chars)
- **Groq reasoning:** The City of Mississauga is a government/public-sector employer, which is not Solidarity Economy aligned. The role is also missing compensation information.
- **Groq Tavily hosts:** ca.linkedin.com, en.wikipedia.org, mississauga.ca (4500 chars)

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
- **Gemini reasoning:** Toronto Renewable Energy Co-operative (TREC) is a non-profit co-operative developing community-owned renewable energy and financing social purpose organizations. Compensation is fully transparent, and the role includes progressive benefits such as interview stipends. As a non-profit co-op directly advancing the solidarity economy, TREC exemplifies SSE principles.
- **Gemini Tavily hosts:** ca.linkedin.com, mcconnellfoundation.ca, riacanada.ca, tapestrycapital.ca, trec.on.ca (4493 chars)
- **Groq reasoning:** Tapestry Community Capital is a non-profit co-op that supports other co-ops and non-profits in raising and managing community investment. The role of HR & Admin Coordinator contributes to the organization's mission of making investing directly in your community the norm. The employer is transparent about compensation and has a clear social/community/environmental mission.
- **Groq Tavily hosts:** ca.linkedin.com, mcconnellfoundation.ca, riacanada.ca, tapestrycapital.ca, trec.on.ca (4493 chars)

## Failures / infra

- None observed.

Log: `/tmp/tavily_job_parity_10_retest.log`
JSON: `/Users/ry/code/wev/wev-scraper/scripts/tavily_job_parity_10_retest.json`
Runner: `/tmp/tavily_job_parity_10_retest.py` (ephemeral; no repo patch)

