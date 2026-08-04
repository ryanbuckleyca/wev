# Tavily-always job parity vs old Gemini grounding (5 jobs)

Generated: `2026-08-03T15:00:39.643004+00:00`

## Setup

- **SSE chain:** `gemini-3.6-flash → gemini-3.5-flash-lite → groq → cerebras` (Gemini first confirmed: `True`)
- **`GEMINI_API_KEY` loaded:** `True` (not skipped at init)
- **`USE_GOOGLE_SEARCH_GROUNDING`:** `False` — **off (expected)**; Tavily replaces Gemini-native Google Search grounding.
- **Tavily available:** `True`
- Mode: force `use_grounding=True` + employer search query (tavily-always); dry-run only — **no DB writes**.

## Sampling

No rated jobs in last 7 days. Selected best available non-placeholder baselines (qualities=['strong', 'strong', 'strong', 'strong', 'strong']). Job sse_details had no explicit provider/model/grounding flags; real structured reasoning + must_haves used as proxy for older Gemini-grounded classifies.

## Headline

**`sse_rating` 3/5 (60%)** · **`is_sse` 3/5 (60%)** · **both 3/5 (60%)** · `type` N/A (job path). Gemini completions: 5/5. Errors: 0. Labels: {'agree': 3, 'improvement_stricter_for_profit': 2}.

## Match rates

- **`sse_rating`:** 3/5 (60%)
- **`is_sse`:** 3/5 (60%)
- **both structural:** 3/5 (60%)
- **`type`:** N/A for job SSE classify (org-assessment field). Linked organizations.type shown for context only; not re-assessed.

## Summary table

| # | Job | Org | Prod rating | Re-run | Rating | is_sse | Provider | Label | Elapsed |
|---|-----|-----|-------------|--------|--------|--------|----------|-------|---------|
| 1 | Communications and Design Coordin... | The New Farm Centre For C... | `strong_yes` | `strong_yes` | yes | yes | `gemini-3.6-flash` | agree | 26.67s |
| 2 | Lands, Waters and Consultation Co... | Historic Saugeen Métis | `strong_yes` | `strong_yes` | yes | yes | `gemini-3.6-flash` | agree | 11.16s |
| 3 | Summer jobs, Student jobs | Georgian Bay Land Trust | `strong_yes` | `strong_yes` | yes | yes | `gemini-3.6-flash` | agree | 10.28s |
| 4 | Toronto outdoors, Summer camps | Toronto Island SUP (TISUP) | `weak_yes` | `no` | NO | NO | `gemini-3.6-flash` | improvement_stricter_for_profit | 10.24s |
| 5 | Algonquin Park Canoe Trip Guides ... | Voyageur Quest | `weak_yes` | `no` | NO | NO | `gemini-3.5-flash-lite` | improvement_stricter_for_profit | 3.42s |

## Analysis

Tavily-always + Gemini-first matched old Gemini-grounded prod on 3/5 clear nonprofit/community `strong_yes` jobs (New Farm, Historic Saugeen Métis, Georgian Bay Land Trust) with employer-correct Tavily hosts (e.g. gblt.org, saugeenmetis.com, regenerationcanada.org). The 2 mismatches are both `weak_yes`→`no` on commercial outdoor operators (TISUP, Voyageur Quest): old Gemini paraphrased mission soft-Yes while Tavily+Gemini now enforces the for-profit gate (Voyageur already labeled for-profit in old reasoning; org row is `no`). That is stricter parity with the rubric, not evidence loss. `USE_GOOGLE_SEARCH_GROUNDING` is off (expected). Verdict: Tavily replaces Gemini-native Search grounding without hurting clear SSE Yes cases and is stricter/more consistent on borderline for-profits.

### Where Tavily+Gemini agrees

- `Communications and Design Coordinator` @ The New Farm Centre For Climate Change — rating=`strong_yes`
- `Lands, Waters and Consultation Coordinator` @ Historic Saugeen Métis — rating=`strong_yes`
- `Summer jobs, Student jobs` @ Georgian Bay Land Trust — rating=`strong_yes`

### Where it diverges

- **improvement_stricter_for_profit** — `Toronto outdoors, Summer camps`: `weak_yes` → `no` (is_sse True → False). Tavily commercial hosts (torontoislandsup.com, tripadvisor.com) enabled a correct for-profit No; old Gemini left governance unknown and scored weak_yes.
- **improvement_stricter_for_profit** — `Algonquin Park Canoe Trip Guides 2026`: `weak_yes` → `no` (is_sse True → False). Old reasoning already said for-profit; Tavily+Gemini applies hard gate (matches org `sse_rating=no`).


### Evidence quality

Tavily returned hosts across the sample: brucecounty.on.ca, clementine-sapphire-3hnw.squarespace.com, facebook.com, gblt.org, gbtownship.ca, hdp-ca-prod-app-saug-engage-files.s3.ca-central-1.amazonaws.com, instagram.com, linkedin.com, myparrysoundnow.com, onthebaymagazine.com, pivotandgrow.com, planthebruce.ca, regenerationcanada.org, saugeenmetis.com, toronto.ca, torontoisland.com, torontoislandsup.com, tripadvisor.com, voyageuroutfitting.com, voyageurquest.com. Old Gemini-grounded prod reasoning typically paraphrases employer identity (charity/nonprofit/for-profit) without listing source URLs, so host overlap cannot be scored directly — compare whether Tavily evidence supports the same employer-structure claims the old reasoning made.

## Job 1: `ba1492a7-32b8-46e4-bae2-ca5877cf5c83`

- **Title:** Communications and Design Coordinator
- **Org:** The New Farm Centre For Climate Change (org_id=1012, prod_org_type=`None`)
- **Location:** Creemore, Ontario / Hybrid (map)
- **Listing:** https://www.goodwork.ca/jobs/communications-marketing-and-graphic-design-jobs-wordpress-website-development-75495
- **Updated:** scraped 2026-03-07T09:31:32.479898+00:00 · classified 2026-03-07T22:00:19.674757+00:00
- **Description length:** 5789 chars
- **Baseline quality:** strong (['real_reasoning', 'long_reasoning', 'has_must_haves', 'has_nice_to_haves', 'has_classified_at', 'evidencey_reasoning'])
- **Divergence label:** `agree`

### Side-by-side

| Field | Prod (old Gemini-grounded*) | Re-run (Tavily-always) |
|-------|----------------------------|------------------------|
| ✓ `sse_rating` | `strong_yes` | `strong_yes` |
| ✓ `is_sse` | `True` | `True` |
| confidence | `0.95` | `0.95` (Δ=0.0) |
| provider | `—` | `gemini-3.6-flash` |
| org `type` (context) | `None` | `None` (job path N/A) |

**Prod reasoning:** The New Farm Centre is a registered charity with a clear mission focused on environmental and social good through regenerative agriculture. The role directly contributes to communicating this mission and supporting resilient food systems. Compensation is transparently stated, job expectations are clear, and the organization expresses a commitment to equity and justice. Several 'nice-to-haves' are met, including a focus on cooperation and a stated mission reinvestment through their charitable work. No automatic 'no' flags were triggered.

**Re-run reasoning:** The New Farm Centre is a registered charity dedicated to advancing regenerative agriculture, climate resilience, and food justice. As a non-profit that donates most of its harvest to food security organizations, it strongly aligns with Solidarity Economy principles. The role provides transparent compensation with benefits and directly supports public education and environmental advocacy.

**Tavily hosts:** instagram.com, linkedin.com, onthebaymagazine.com, pivotandgrow.com, regenerationcanada.org (4492 chars)

- must_haves overlap count: 1 · prod_only=4 · rerun_only=4
- flags overlap: [] · prod_only=[] · rerun_only=[]

### Diff notes

- Divergence label: **agree**
- Reasoning text drifted (expected for narrative fields)
- must_haves set drift (prod_only=4, rerun_only=4)
- Tavily hosts: instagram.com, linkedin.com, onthebaymagazine.com, pivotandgrow.com, regenerationcanada.org
- Old reasoning cited no URLs (typical of Gemini grounding prose that paraphrases search without linking).
- Structural fields matched
- Baseline quality=strong score=8 signals=['real_reasoning', 'long_reasoning', 'has_must_haves', 'has_nice_to_haves', 'has_classified_at', 'evidencey_reasoning']

## Job 2: `3b2ae1df-f5ce-4a6c-9636-76ffcb14c903`

- **Title:** Lands, Waters and Consultation Coordinator
- **Org:** Historic Saugeen Métis (org_id=468, prod_org_type=`other`)
- **Location:** Southampton, Bruce County, Ontario
- **Listing:** https://www.goodwork.ca/jobs/land-and-water-stewardship-environmental-studies-environmental-science-and-natural-resources-jobs-75494
- **Updated:** scraped 2026-03-07T09:31:33.044441+00:00 · classified 2026-03-07T21:49:36.651660+00:00
- **Description length:** 4346 chars
- **Baseline quality:** strong (['real_reasoning', 'long_reasoning', 'has_must_haves', 'has_nice_to_haves', 'has_classified_at', 'evidencey_reasoning'])
- **Divergence label:** `agree`

### Side-by-side

| Field | Prod (old Gemini-grounded*) | Re-run (Tavily-always) |
|-------|----------------------------|------------------------|
| ✓ `sse_rating` | `strong_yes` | `strong_yes` |
| ✓ `is_sse` | `True` | `True` |
| confidence | `0.95` | `0.95` (Δ=0.0) |
| provider | `—` | `gemini-3.6-flash` |
| org `type` (context) | `other` | `None` (job path N/A) |

**Prod reasoning:** The job posting for the Historic Saugeen Métis, an independent, historic Métis community, strongly aligns with Solidarity Economy (SSE) principles. All 'must-have' criteria are clearly met: the organization has a clear purpose beyond profit focused on people, community, and planet; the impact is intentionally described through environmental stewardship and community interests; the role directly contributes to social, community, and environmental good; compensation is transparently stated as an hourly rate; and job expectations regarding hours and contract type are clear. There are no automatic 'no' flags. Several 'nice-to-have' criteria are also met, reinforcing the 'strong_yes' rating, particularly the community-based governance model and investment in professional development.

**Re-run reasoning:** Historic Saugeen Métis is an elected, rights-bearing Indigenous community organization dedicated to community governance, culture, and lands stewardship. The role directly advances environmental protection and Indigenous rights with clear, transparent compensation ($37–$42/hr) and strong worker investments including flexible hours and training.

**Tavily hosts:** brucecounty.on.ca, hdp-ca-prod-app-saug-engage-files.s3.ca-central-1.amazonaws.com, planthebruce.ca, saugeenmetis.com (3744 chars)

- must_haves overlap count: 0 · prod_only=5 · rerun_only=5
- flags overlap: [] · prod_only=['Mission reinvestment is inferred from the nature of a community-based organization rather than explicitly stated in terms of surplus allocation.', "The extent of participatory governance for workers beyond reporting to Council is not explicitly detailed, but implied by the community's governance structure."] · rerun_only=[]

### Diff notes

- Divergence label: **agree**
- Reasoning text drifted (expected for narrative fields)
- must_haves set drift (prod_only=5, rerun_only=5)
- Tavily hosts: brucecounty.on.ca, hdp-ca-prod-app-saug-engage-files.s3.ca-central-1.amazonaws.com, planthebruce.ca, saugeenmetis.com
- Old reasoning cited no URLs (typical of Gemini grounding prose that paraphrases search without linking).
- Structural fields matched
- Baseline quality=strong score=8 signals=['real_reasoning', 'long_reasoning', 'has_must_haves', 'has_nice_to_haves', 'has_classified_at', 'evidencey_reasoning']

## Job 3: `352163a0-40a7-4b72-aecf-9a98035f334f`

- **Title:** Summer jobs, Student jobs
- **Org:** Georgian Bay Land Trust (org_id=410, prod_org_type=`nonprofit`)
- **Location:** Eastern Georgian Bay (Midland, Parry Sound, etc.)
- **Listing:** https://www.goodwork.ca/jobs/communications-marketing-community-events-representative-spokesperson-and-ambassador-jobs-75434
- **Updated:** scraped 2026-03-07T09:31:35.362496+00:00 · classified 2026-03-07T21:49:15.888809+00:00
- **Description length:** 3697 chars
- **Baseline quality:** strong (['real_reasoning', 'long_reasoning', 'has_must_haves', 'has_nice_to_haves', 'has_classified_at', 'evidencey_reasoning'])
- **Divergence label:** `agree`

### Side-by-side

| Field | Prod (old Gemini-grounded*) | Re-run (Tavily-always) |
|-------|----------------------------|------------------------|
| ✓ `sse_rating` | `strong_yes` | `strong_yes` |
| ✓ `is_sse` | `True` | `True` |
| confidence | `0.95` | `0.95` (Δ=0.0) |
| provider | `—` | `gemini-3.6-flash` |
| org `type` (context) | `nonprofit` | `None` (job path N/A) |

**Prod reasoning:** The Georgian Bay Land Trust is a registered non-profit charity with a clear mission to preserve the environment of Eastern Georgian Bay and promote its appreciation for public benefit. This directly aligns with SSE principles by prioritizing the planet and community over profit. The job role, 'Summer Outreach Student,' directly contributes to this mission through community engagement, fundraising support, and potential direct conservation work, demonstrating intentional impact beyond profit. Compensation is transparently stated at $21/hr, and job expectations regarding hours and duration are clear. As a non-profit land trust, its governance model inherently supports mission reinvestment, with any surplus going back into its conservation and community initiatives rather than shareholders. The organization also explicitly mentions being 'volunteer-oriented' and actively engaging 'commun...

**Re-run reasoning:** The Georgian Bay Land Trust is a registered Canadian charity dedicated to protecting wilderness lands and species along eastern Georgian Bay. This role directly supports its mission through community outreach, environmental education, and public engagement. The position offers transparent compensation ($21/hour) and clear job expectations for a seasonal student role.

**Tavily hosts:** clementine-sapphire-3hnw.squarespace.com, facebook.com, gblt.org, gbtownship.ca, myparrysoundnow.com (2877 chars)

- must_haves overlap count: 0 · prod_only=5 · rerun_only=5
- flags overlap: [] · prod_only=[] · rerun_only=[]

### Diff notes

- Divergence label: **agree**
- Reasoning text drifted (expected for narrative fields)
- must_haves set drift (prod_only=5, rerun_only=5)
- Tavily hosts: clementine-sapphire-3hnw.squarespace.com, facebook.com, gblt.org, gbtownship.ca, myparrysoundnow.com
- Old reasoning cited no URLs (typical of Gemini grounding prose that paraphrases search without linking).
- Structural fields matched
- Baseline quality=strong score=8 signals=['real_reasoning', 'long_reasoning', 'has_must_haves', 'has_nice_to_haves', 'has_classified_at', 'evidencey_reasoning']

## Job 4: `9bdba800-f5f3-4e5d-b04d-b94206381125`

- **Title:** Toronto outdoors, Summer camps
- **Org:** Toronto Island SUP (TISUP) (org_id=937, prod_org_type=`None`)
- **Location:** Wards Island, Toronto Island ON
- **Listing:** https://www.goodwork.ca/jobs/outdoor-recreation-and-summer-camp-director-jobs-75037
- **Updated:** scraped 2026-03-07T09:31:35.928733+00:00 · classified 2026-03-07T22:00:01.304889+00:00
- **Description length:** 6000 chars
- **Baseline quality:** strong (['real_reasoning', 'long_reasoning', 'has_must_haves', 'has_nice_to_haves', 'has_classified_at', 'evidencey_reasoning'])
- **Divergence label:** `improvement_stricter_for_profit`

### Side-by-side

| Field | Prod (old Gemini-grounded*) | Re-run (Tavily-always) |
|-------|----------------------------|------------------------|
| ✗ `sse_rating` | `weak_yes` | `no` |
| ✗ `is_sse` | `True` | `False` |
| confidence | `0.8` | `0.95` (Δ=0.1499999999999999) |
| provider | `—` | `gemini-3.6-flash` |
| org `type` (context) | `None` | `None` (job path N/A) |

**Prod reasoning:** The role focuses on a social and environmental purpose by providing outdoor education and community-building activities for children. The organization's mission appears to align with SSE principles, emphasizing character development and environmental awareness. However, the organizational structure and governance model are not explicitly stated, and compensation details are vague, falling into the 'discussed during interview' category rather than being transparently disclosed upfront. While volunteer work is not explicitly mentioned for this paid role, the lack of concrete salary information is a concern.

**Re-run reasoning:** Toronto Island SUP is a private, for-profit outdoor recreation business, which triggers an automatic 'no' flag under Solidarity Economy criteria despite its outdoor education and environmental focus. Additionally, compensation details are not disclosed upfront in the posting.

**Tavily hosts:** instagram.com, toronto.ca, torontoisland.com, torontoislandsup.com, tripadvisor.com (4129 chars)

- must_haves overlap count: 0 · prod_only=4 · rerun_only=2
- flags overlap: [] · prod_only=["Salary is 'N/A' and compensation is described as 'competitive within the local outdoor recreation industry and is discussed during the interview process,' which lacks transparency.", 'The governance model of Toronto Island SUP is not specified.'] · rerun_only=['Conventional for-profit employer', 'Undisclosed or vague compensation']

### Diff notes

- Divergence label: **improvement_stricter_for_profit**
- Old Gemini gave weak_yes despite unknown governance + vague pay; Tavily surfaced torontoislandsup.com / tripadvisor commercial signals and Gemini correctly applied the for-profit automatic-no gate. Looks like improvement vs overly lenient old grounding, not a quality regression.
- Structural drift on `sse_rating`: prod=weak_yes → rerun=no
- Structural drift on `is_sse`: prod=True → rerun=False
- Reasoning text drifted (expected for narrative fields)
- must_haves set drift (prod_only=4, rerun_only=2)
- Tavily hosts: instagram.com, toronto.ca, torontoisland.com, torontoislandsup.com, tripadvisor.com
- Old reasoning cited no URLs (typical of Gemini grounding prose that paraphrases search without linking).
- Baseline quality=strong score=8 signals=['real_reasoning', 'long_reasoning', 'has_must_haves', 'has_nice_to_haves', 'has_classified_at', 'evidencey_reasoning']

## Job 5: `afd79cf6-d699-4b59-86c4-68da2d3b28dc`

- **Title:** Algonquin Park Canoe Trip Guides 2026
- **Org:** Voyageur Quest (org_id=774, prod_org_type=`other`)
- **Location:** Based at Algonquin Park Access Pt #1, near South River, Ontario
- **Listing:** https://www.goodwork.ca/jobs/algonquin-park-canoe-guide-jobs-75425
- **Updated:** scraped 2026-03-07T09:31:36.498622+00:00 · classified 2026-03-07T22:00:15.725796+00:00
- **Description length:** 6468 chars
- **Baseline quality:** strong (['real_reasoning', 'long_reasoning', 'has_must_haves', 'has_nice_to_haves', 'has_classified_at', 'evidencey_reasoning'])
- **Divergence label:** `improvement_stricter_for_profit`

### Side-by-side

| Field | Prod (old Gemini-grounded*) | Re-run (Tavily-always) |
|-------|----------------------------|------------------------|
| ✗ `sse_rating` | `weak_yes` | `no` |
| ✗ `is_sse` | `True` | `False` |
| confidence | `0.8` | `0.95` (Δ=0.1499999999999999) |
| provider | `—` | `gemini-3.5-flash-lite` |
| org `type` (context) | `other` | `None` (job path N/A) |

**Prod reasoning:** The organization is a for-profit wilderness tour company, which automatically disqualifies it from a 'strong_yes' rating. However, the role itself aligns with SSE principles by focusing on education, connecting guests with nature, and fostering a sense of community among staff. The compensation is transparent, and there are stated opportunities for professional development. The mission is primarily focused on the experience of the outdoors and education, which has a social and environmental component, but it is within a commercial, for-profit structure.

**Re-run reasoning:** Voyageur Quest is a commercial wilderness tour and outfitting company operating as a conventional for-profit enterprise rather than a cooperative, nonprofit, or solidarity economy entity. Because it is a private for-profit business, it fails the mandatory governance gate for Solidarity Economy alignment despite its outdoor and educational programming.

**Tavily hosts:** facebook.com, voyageuroutfitting.com, voyageurquest.com (3673 chars)

- must_haves overlap count: 0 · prod_only=5 · rerun_only=4
- flags overlap: [] · prod_only=['For-profit organization structure', "While there's a focus on nature and education, the primary business model is commercial tourism."] · rerun_only=['Employer is a conventional for-profit tour company rather than a nonprofit, cooperative, or solidarity enterprise.']

### Diff notes

- Divergence label: **improvement_stricter_for_profit**
- Old Gemini already called Voyageur Quest for-profit but still scored weak_yes; linked org assessment is sse_rating=no. Tavily hit voyageurquest.com and Gemini applied the hard for-profit gate → no. Aligns with org baseline; improvement over inconsistent job weak_yes.
- Structural drift on `sse_rating`: prod=weak_yes → rerun=no
- Structural drift on `is_sse`: prod=True → rerun=False
- Reasoning text drifted (expected for narrative fields)
- must_haves set drift (prod_only=5, rerun_only=4)
- Tavily hosts: facebook.com, voyageuroutfitting.com, voyageurquest.com
- Old reasoning cited no URLs (typical of Gemini grounding prose that paraphrases search without linking).
- Baseline quality=strong score=8 signals=['real_reasoning', 'long_reasoning', 'has_must_haves', 'has_nice_to_haves', 'has_classified_at', 'evidencey_reasoning']

## Failures / infra

- None observed.

Log: `/tmp/tavily_job_parity_5_gemini.log`
JSON: `/Users/ry/code/wev/wev-scraper/scripts/tavily_job_parity_5_gemini.json`
Script: `/Users/ry/code/wev/wev-scraper/scripts/tavily_job_parity_5_gemini.py`

\* Prod rows lack explicit `provider`/`uses_google_search_grounding` on `jobs.sse_details`; baseline selection used structured non-placeholder reasoning as a proxy for older Gemini+Search grounding runs.

