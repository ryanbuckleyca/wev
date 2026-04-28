# Scripts

Post-processing scripts for jobs already in the database.

All scripts default to the **test database**. Pass `--prod` or set `USE_PROD_DB=1` to target production.

---

## Skills tagging — vector embeddings

Jobs are tagged with ESCO skills via Jina v3 vector embeddings. Job text is embedded and matched against the full ESCO skill taxonomy using cosine similarity. Results are written to `job_skills` (all matches above the score floor) and `jobs.skills` (top 10).

Runs automatically after every scrape when `SHOULD_TAG_SKILLS=1`.

**To run manually:**

```bash
python -m scripts.tag_esco_skills_vector --limit 10        # 10 most recent jobs
python -m scripts.tag_esco_skills_vector --job-ids <uuid>  # specific jobs
python -m scripts.tag_esco_skills_vector --backfill        # all untagged jobs
python -m scripts.tag_esco_skills_vector --backfill --retag  # retag everything
python -m scripts.tag_esco_skills_vector --dry-run
python -m scripts.tag_esco_skills_vector --prod
```

**Env flags:**

| Flag                     | Effect                              |
| ------------------------ | ----------------------------------- |
| `SHOULD_TAG_SKILLS=1`    | Enable skills tagging               |
| `SHOULD_RE_TAG_SKILLS=1` | Retag jobs that already have skills |

---

## unified_post_processor.py

The primary post-processor. Called automatically by `scrape.py` after each scrape. Can also be run directly.

One LLM call per batch extracts **summary**, **work values**, and **SSE classification** together.

```bash
python scripts/unified_post_processor.py --task all
python scripts/unified_post_processor.py --task summary
python scripts/unified_post_processor.py --task values
python scripts/unified_post_processor.py --task sse
python scripts/unified_post_processor.py --task all --limit 50
python scripts/unified_post_processor.py --job-id <uuid>
python scripts/unified_post_processor.py --dry-run --verbose
```

`--task` options: `all`, `summary`, `values`, `sse`

Jobs that already have data for the requested task are skipped unless the relevant reprocess flag is set.

---

## classify_existing_jobs.py

SSE classification only. Each job gets its own Gemini API call with Google Search grounding for accurate org research.

Requires `GEMINI_API_KEY`.

```bash
python scripts/classify_existing_jobs.py
python scripts/classify_existing_jobs.py --limit 50
python scripts/classify_existing_jobs.py --job-id <uuid>
python scripts/classify_existing_jobs.py --delay 1.0
python scripts/classify_existing_jobs.py --quiet
SHOULD_RE_CLASSIFY=1 python scripts/classify_existing_jobs.py
```

---

## geocode_existing_jobs.py

Re-parses location strings using LLM to populate `municipality`, `province`, `is_remote`, and `work_type`. Requires `SHOULD_GEOCODE=1`.

```bash
SHOULD_GEOCODE=1 python scripts/geocode_existing_jobs.py
SHOULD_GEOCODE=1 python scripts/geocode_existing_jobs.py --limit 50
SHOULD_GEOCODE=1 python scripts/geocode_existing_jobs.py --prod
```

---

## Job matches — Python helpers

`job_matches` is maintained by **Postgres triggers** when `profiles` / `jobs` change. Implementation details: **`wev-bulletin/lib/match-calculator.ts`** and **`wev-bulletin/supabase/migrations/`**.

**Scraper:** persist **`jobs.values` and `jobs.values_rated`** when tagging (`llm/unified_provider.py`, `scripts/tag_job_values.py`, **`unified_post_processor.py`**) so job-side confidence is used.

### calculate_matches.py

Calls **`recalculate_matches_for_user` / `recalculate_matches_for_job`** over the Supabase API (`rpc()`), i.e. the **same PL/pgSQL** as the triggers. Requires migration **`20260328120000_grant_recalculate_match_rpcs.sql`** applied (`GRANT EXECUTE` for `service_role`).

- `--user-id` — one user, all jobs (`--limit` is ignored).
- `--job-id` — one job, all users.
- `--all` — RPC per profile (expensive); optional **`--limit`** caps how many profiles are processed.

```bash
python scripts/calculate_matches.py --user-id <uuid>
python scripts/calculate_matches.py --job-id <uuid>
python scripts/calculate_matches.py --all
python scripts/calculate_matches.py --all --limit 500
```

### match_recent_jobs.py

Runs **`calculate_matches_for_job`** from `calculate_matches.py` (Postgres RPC) on the N most recent jobs.

```bash
python scripts/match_recent_jobs.py
python scripts/match_recent_jobs.py --limit 10
```

### matching_engine.py

Optional hooks (`on_job_tagged_or_updated`, `on_user_values_updated`) that call the same RPCs — use only if something outside the DB must nudge matching; triggers already cover normal updates.

---

## cleanup_job_duplicates.py

Finds duplicate jobs by `listing_url` and deletes all but the row with the most data.

```bash
python scripts/cleanup_job_duplicates.py --dry-run
python scripts/cleanup_job_duplicates.py
python scripts/cleanup_job_duplicates.py --prod --dry-run
python scripts/cleanup_job_duplicates.py --prod
```

---

## Common env flags

| Flag                         | Effect                                     |
| ---------------------------- | ------------------------------------------ |
| `SHOULD_CLASSIFY=1`          | Run SSE classification                     |
| `SHOULD_RE_CLASSIFY=1`       | Re-classify already-classified jobs        |
| `SHOULD_GEOCODE=1`           | Run geocoding                              |
| `SHOULD_RE_GEOCODE=1`        | Re-geocode already-geocoded jobs           |
| `SHOULD_SUMMARIZE=1`         | Generate summaries                         |
| `SHOULD_RE_SUMMARIZE=1`      | Regenerate existing summaries              |
| `SHOULD_TAG_VALUES=1`        | Tag work values                            |
| `SHOULD_RE_TAG_VALUES=1`     | Retag existing values                      |
| `SHOULD_TAG_SKILLS=1`        | Tag ESCO skills via vector embeddings      |
| `SHOULD_RE_TAG_SKILLS=1`     | Retag jobs that already have skills        |
| `SHOULD_OVERRIDE_EXISTING=1` | Overwrite existing jobs on scrape          |
| `CONFIRM_PROD_RUN=YES`       | Skip interactive prompt for `--prod` in CI |
