# Branch review: `fix-match-recalc-null-shared-skills`

Base: `main` @ `2aec1a10`. No commits yet; everything is working-tree changes plus two untracked migrations.

## Scope

| File | Change | Verdict |
| --- | --- | --- |
| `supabase/migrations/20261021154500_fix_match_recalc_null_shared_skills.sql` | new — recalc hotfix (null `shared_skills`) | OK |
| `supabase/migrations/20261022010000_halfvec_embeddings.sql` | new — `vector(1024)` → `halfvec(1024)` | OK, with operational notes |
| `wev-bulletin/lib/supabase/database.types.ts` | regenerated types | **Do not commit as-is** |
| `wev-scraper/lib/database_models.py` | regenerated models | OK |
| `supabase/config.toml` | `[inbucket]` → `[local_smtp]` | OK |
| `.gitignore` | ignore `/halfvec-eval/` | OK |

Overall: the two migrations are correct and safe to apply. The blocker is the `database.types.ts` regen, which is a typing regression unrelated to the migrations. Fix that before merge.

## Findings

### 1. `database.types.ts` regen is a regression — do not commit this version (High)

The regenerated file was produced by a different generator/CLI version or against a drifted schema, and it loses typing the app relies on:

- `wev-bulletin/lib/supabase/database.types.ts:85`, `:257-258`, `:328`, `:389` — `embedding` / `skill_embedding` / `skill_phrase_embedding` changed from `string | null` to `unknown`. Client code sends and reads these as strings (`wev-bulletin/lib/cv/matcher.ts:132` builds `` `[${vec.join(',')}]` ``; `database_models.py` types them `Optional[str]`). `unknown` removes that contract. This is also wrong for halfvec: PostgREST still returns halfvec columns as strings, so the correct type stays `string | null`.
- `wev-bulletin/lib/supabase/database.types.ts:11-12` — removed `__InternalSupabase.PostgrestVersion`.
- `:60`, `:212`, `:371` and others — `Relationships` arrays stripped, which drops FK typing used for nested selects.
- Many `... | null` → non-null flips (e.g. `bookmarks.created_at`, `tags`) that look like generation artifacts, not intended schema changes.

Recommendation: drop this file from the branch and let `npm run migrate:*` regenerate it (the migrate script refreshes types after push), or regenerate with the pinned CLI via `npm run types:supabase`. Do not hand-ship this diff.

### 2. Removing `SET statement_timeout` from the match RPCs is deliberate — call it out (Medium)

`20261022010000_halfvec_embeddings.sql:513-562`. Both `match_skills_by_embedding` overloads drop `SET statement_timeout = '60s'`. This is required: a `SET` clause blocks SQL-function inlining, and without inlining the planner seq-scans halfvec (~195 ms) instead of using the HNSW index (~2 ms). Verified empirically in the sandbox.

Consequence: these RPCs now inherit the role/database `statement_timeout` instead of a function-local 60 s. That is fine given the index path is ~2 ms and the worst-case fallback (missing index) seq-scan is ~200 ms, but the safety net moved. If a per-call cap is still wanted, set it on the role or pooler, not the function.

### 3. Operational: the migration holds ACCESS EXCLUSIVE on `esco_skills` and `jobs` for the whole transaction (Medium)

`20261022010000_halfvec_embeddings.sql:29-56`. `ALTER TYPE` rewrites the tables and the HNSW indexes are rebuilt in the same transaction (correct — you must not leave a window with no index, so `CREATE INDEX CONCURRENTLY` is intentionally not used). In the sandbox the exclusive section was ~28 s (esco index ~20 s, jobs ~5 s) under amd64 emulation. On prod, reads and writes to `esco_skills`, `jobs`, `profiles`, and `job_skill_phrases` block for that window.

Recommendation: deploy in a quiet window with scraper / queue drain / `skills:embeddings` / pg_cron paused (as covered in the rollout plan). Consider a short `lock_timeout` guard so the `ALTER TYPE` fails fast rather than queueing behind a long reader. Have a backup / confirmed PITR before the prod push — rollback is another exclusive rewrite back to `vector(1024)`.

### 4. Test coverage does not cover the bug this branch fixes (Medium)

`supabase/tests/match_calculator.test.sql` never exercises the weighted path (`values_rated` with ranks) and only creates 1–2 jobs, so it cannot reproduce the null-`shared_skills` insert that broke prod. It would have passed against the broken code.

Recommendation: add a case with a weighted profile plus at least one matchable job outside the skill candidate set, and assert no inserted `job_matches` row has null `shared_skills`. No halfvec-specific assertion is needed, but a smoke test that `match_skills_by_embedding` returns rows after the type change would catch an inlining/index regression.

### 5. Redundant recalc definition across the two migrations (Low)

`recalculate_matches_for_user` is fully redefined in both `20261021154500` (the hotfix) and `20261022010000` (halfvec). The halfvec version supersedes and carries the same COALESCE fix on both paths (`:370`, `:473`), so the end state is correct. Fine to keep — the hotfix matches what is already live on prod — but note the final definition comes from the halfvec migration.

### 6. Idempotency nits (Low)

Repo convention (`supabase/migrations/README.md`) prefers `IF NOT EXISTS`. `CREATE INDEX` (`:44-56`) and `CREATE VIEW` (`:639`) are not guarded, but each is preceded by a matching `DROP ... IF EXISTS`, and migrations run once, so a partial re-run is the only failure mode. Low priority.

### 7. Pre-existing: `recalculate_matches_for_user` is `SECURITY DEFINER` without `SET search_path` (Low, inherited)

`20261022010000:58-62`. The function creates an unqualified temp table (`_temp_skill_scores`). The `compute_*` functions set `search_path = public`; recalc does not. This matches the current live function and is not introduced by this branch, but worth hardening in a future change.

## Verified good

- vector → halfvec assignment cast works implicitly, so `match_calculator.test.sql:25-27` (which inserts `::vector` literals into `esco_skills.embedding`) still passes after the type change. Confirmed in the migrated sandbox.
- `matched_jobs` is the only object depending on the embedding columns; dropping and recreating it (`:27`, `:639`) is sufficient for `ALTER TYPE`. The recreated view uses `j.*`, so it picks up the halfvec columns, and `GRANT SELECT` to `anon, authenticated, service_role` matches the prior definition.
- All functions use `CREATE OR REPLACE` with unchanged signatures and return types, so grants and the `private.restricted_rpc` manifest are preserved — no re-run of `apply_restricted_rpc_grants()` needed, and `restricted_rpc_grants.test.sql` stays valid.
- HNSW rebuild params match prod: esco partial (`WHERE embedding IS NOT NULL`), jobs and profiles non-partial, all `halfvec_cosine_ops`, `m = 16`, `ef_construction = 64`.
- RPC argument types stay `vector` / `vector[]` with the cast at `<=>`, so the scraper and bulletin keep sending the same text/JSON arrays. PostgREST insert + both RPC overloads + `bulk_update_skill_embeddings` were exercised against local PostgREST and matched SQL results.
- The COALESCE fix is present on both the weighted and flat paths in both migrations.
- `ALTER TYPE` does not fire row triggers, so the recalc queue is not repopulated by the migration.
- `database_models.py` changes are a correct schema catch-up: `ProfileSkillPhrases` → `JobSkillPhrases`, and `skill_details` / `qualifications` / `skill_phrase_embedding` added to `Jobs` and `MatchedJobs`. `skill_phrase_embedding: Optional[str]` is consistent with halfvec-as-string.
- `config.toml` and `.gitignore` changes are correct and low risk.

## Before merge

1. Replace the `database.types.ts` diff with a clean regeneration (or let the migrate script produce it). Finding 1.
2. Add a weighted-path regression test. Finding 4.
3. Confirm the prod deploy window and backup/PITR for the exclusive-lock rewrite. Finding 3.
