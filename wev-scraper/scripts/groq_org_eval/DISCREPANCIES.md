# SSE parity discrepancies

Tracker JSON: `DISCREPANCIES.json` · Canvas: `sse-parity-discrepancies.canvas.tsx`

## Why models diverge from prod

1. **Rating calibration** — Prod often `strong_yes` for clear charities/foundations; new models prefer `weak_yes`. Job rubric previously allowed `weak_yes` for “mission-driven roles in traditional corps,” which Groq applied to consultancies and corporate CSR titles.
2. **Sector ambiguity** — Adjacent taxonomy buckets (environment vs civic, civic vs care) without priority rules.
3. **Language bar** — Models upgrade to `bilingual` from `.ca` / accented names without bilingual site evidence.
4. **Evidence starvation** — Skipping Tavily when org description existed left interpretive fields with only name + known URL.
5. **Scrape vs posting identity** — Organization metadata ≠ About-section employer (Goparity / TREC / Inspirit).
6. **Prod gaps** — Incomplete baselines (TOHU), `is_sse`≠`sse_rating` (Selva), and **97/97 jobs in last 48h lack `sse_rating`** while `is_sse` is set.

## v8 (5 linked pairs, orgs created last 48h)

| Org | Job | Org vs prod | Job note |
|-----|-----|-------------|----------|
| EXP | Lead Water Resources Engineer | sector/lang drift | lite `no` ✓; groq `weak_yes` ✗ |
| Hutchinson | Environmental Scientist | match | same groq false-yes |
| EnVision | Environmental Technician | match | same |
| Lyft | Social Impact Coordinator | match | same |
| Mastercard Foundation | Lead, Fellows | `weak_yes` vs `strong_yes` | groq job `strong_yes` / prod `is_sse` true |

## Fixes landed

- Job `RATING_GUIDELINES` + auto-no flags: governance gate — for-profit consultancies /
  corporate CSR / “mission-driven roles in traditional corps” → **`no`** (not SSE)
- Batch rating guidelines aligned (no corp weak_yes loophole)
- Org assessor: Tavily again for interpretive research even when description exists
- Sector priority + stricter bilingual rules
- Foundation `strong_yes` calibration in org rating guidelines

## v9 regression retest (after governance-gate fix)

| Sample | Org | Job (lite / groq) |
|--------|-----|-------------------|
| Lyft Social Impact | match `no` | both **`no`** (was groq weak_yes) |
| Hutchinson Env Scientist | match `no` | both **`no`** |
| EnVision Env Technician | match `no` | both **`no`** |
| Toronto Wildlife Centre | Vernova `no` ✓ | groq **`strong_yes`** ✓; lite `weak_yes` |
| Mastercard Foundation | lite **`strong_yes`** ✓ (was weak_yes) | groq strong_yes / lite weak_yes |

Remaining: Gemini 3.6 free-tier 429 during batch; bilingual vs en on a couple orgs;
job `sse_rating` still null on recent scrapes in prod.

## v10 (complete orgs last ~72h + rated complete jobs)

| Sample | Org vs prod | Job vs prod |
|--------|-------------|-------------|
| La Ligue des Noirs (1363) + CFP job | 3.6+lite match; groq `weak_yes` vs `strong_yes` | lite+groq match `strong_yes` |
| SHEIN (1354) + EnviroCentre job | all match `no` / retail / en / other | lite+groq match `strong_yes` |
| Mastercard Foundation (1349) + TEA job | lite+groq match incl. bilingual + `strong_yes` | lite+groq match |
| EXP (1348) + CPAWS job | rating/sector/type match; lite `bilingual` vs prod `en` | groq match; lite `weak_yes` vs `strong_yes` |

Also: org rubric now explicitly bans job “Transparent compensation” must-haves
(prompt + parse strip). No compensation leaks observed in v10 org outputs.
