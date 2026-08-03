# Backfill review — skip retry + next-50 (Ollama off)

Date: 2026-08-02 ~20:13–20:23

## Code change

Ollama temporarily commented out of SSE chain in `llm/gemini_fallback.py` (candidates list). Runtime chain observed: `groq → cerebras` (Gemini skipped — `GEMINI_API_KEY` not in loaded `.env`).

## Cerebras health

**Not healthy.** Reloaded key from parent `wev/.env`; provider initializes, but API returns **402 payment_required** (`Payment required to access this resource. Visit your billing tab.`). Classified in logs as quota exceeded / no more providers.

Also: Groq `llama-3.3-70b-versatile` daily quota exhausted → `llama-3.1-8b-instant` also 429.

## Skip retry (558 / 561 / 562 / 564)

Log: `/tmp/backfill_org_minimal_50_20260802_201343_skips558.log`  
Command: `--publish --mode minimal --after-id 557 --limit 4`

| id | name | result |
|----|------|--------|
| 558 | Corporation Mainbourg | **updated** — website `https://mainbourg.org`, `strong_yes`, nonprofit, housing |
| 561 | The Locksley Project | skipped — Groq 429 → Cerebras 402 |
| 562 | Espace M – Ressources pour mères monoparentales | skipped — same |
| 564 | Restorative Landscapes Inc. | skipped — same |

Summary: `processed=4, updated=1, skipped=3`

## Next-50 after 564

Log: `/tmp/backfill_org_minimal_50_20260802_201548.log`  
Command: `--publish --mode minimal --after-id 564 --limit 50`

- **Aborted** mid-run (~7 min); no Summary line.
- **0 updates**, **29 skips** (assessor returned None) for ids 565–605 (gaps where already rated).
- Last completed skip: **605**; died while retrying **606**.
- Cause: Groq 429 + Cerebras 402 on every org; no Gemini key in env.

Resume after providers recover: re-run skips `561,562,564` (still `sse_rating IS NULL`), then `--after-id 564 --limit 50` (or `--after-id 605` only if you accept leaving 561/562/564 for a separate pass).

## Blockers before next attempt

1. Cerebras billing / valid paid-or-free quota on the new key (402 today).
2. Restore `GEMINI_API_KEY` in `wev/.env` (present in prior evening run; missing now).
3. Groq daily quota reset, or wait for rate limits.
