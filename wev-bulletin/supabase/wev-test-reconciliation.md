# wev-test Reconciliation Checklist

This checklist turns the March 28, 2026 `supabase db diff --db-url wev-test` output into concrete schema work to bring `wev-test` in line with the current branch.

Artifacts prepared alongside this checklist:

- Reconciliation migration:
  `/Users/ryanbuckley/code/wev/wev-bulletin/supabase/migrations/20260328160000_reconcile_schema_to_current_branch.sql`
- Read-only preflight:
  `/Users/ryanbuckley/code/wev/wev-bulletin/supabase/checks/20260328160000_reconcile_schema_preflight.sql`

## 1. Preflight: verify current data is compatible

Run the read-only preflight first and stop if any row is returned from the detail queries.

The critical compatibility checks are:

- `public.profiles.skills` length must already be `<= 10`
- `public.profiles.values` length must already be `<= 5`
- `public.profiles.skills_rated` must be `NULL` or a JSON array with length `<= 10`
- `public.profiles.values_rated` must be `NULL` or a JSON array with length `<= 5`
- `public.jobs.skills` length must already be `<= 10`
- `rank` / `confidence` values in rated JSON must be numeric if present

## 2. Code-coupled drift to reconcile

These differences directly affect current app behavior and should be fixed before trusting `wev-test` as branch-aligned.

- Replace the legacy tier-based DB matching engine with the rank/confidence engine used by the branch.
  Current branch source of truth:
  `/Users/ryanbuckley/code/wev/wev-bulletin/lib/match-calculator.ts`
  `/Users/ryanbuckley/code/wev/wev-bulletin/lib/value-ratings.ts`
  `/Users/ryanbuckley/code/wev/wev-bulletin/supabase/migrations/20260328000000_job_confidence_in_matching.sql`
- Drop `public.value_tier_weight(text)`
- Create `public.rank_weight(int, int)` and `public.job_confidence_weight(jsonb, text)`
- Replace `public.recalculate_matches_for_user(uuid)` and `public.recalculate_matches_for_job(uuid)` with the current branch versions
- Replace `public.trigger_recalculate_job_matches()` and `public.trigger_recalculate_user_matches()`
- Recreate `trg_job_values_changed` and `trg_profile_values_changed` so `skills` changes also recalculate matches
- Ensure `public.job_matches.value_score`, `skill_score`, and `shared_skills` exist and `score` is nullable
- Normalize profile constraints to the branch shape:
  - `profiles_skills_max_10_check`
  - `profiles_skills_rated_max_10_check`
  - `profiles_values_max_5_check`
  - `profiles_values_rated_max_5_check`
- Drop the legacy `profiles_skills_max_5_check`

## 3. Exact branch-normalization drift

These differences were confirmed on `wev-test` but are less directly coupled to current feature behavior. They should still be reconciled if the goal is an exact branch match.

- Drop the legacy auto-RLS event trigger and helper:
  - event trigger `ensure_rls`
  - function `public.rls_auto_enable()`
- Disable RLS on tables the current branch does not recreate with RLS enabled:
  - `public.jobs`
  - `public.organizations`
  - `public.scrape_runs`
  - `public.sources`
  - `public.user_roles`
- Remove extra `profiles` policies that are not part of the branch migration set:
  - `Users can insert own profile`
  - `Users can update own profile`
  - `Users can view own profile`
- Keep only the branch-authoritative `profiles` policies:
  - `Users can view their own profile`
  - `Users can update their own profile`
- Drop the extra `user_roles` policy `users_can_view_own_roles`
- Drop `idx_scrape_runs_source_id`
- Restore `jobs_source_id_fkey` in a forward-only repair migration because app embeds still depend on `jobs -> sources`

## 4. Optional exact-body normalization

The diff also showed `search_esco_skills(...)` drift. The prepared reconciliation migration re-applies the branch’s canonical function body to keep that object aligned too.

## 5. After applying the reconciliation migration

Run these validations in order:

- Re-run the read-only preflight and confirm no compatibility issues remain
- Re-run:
  `supabase db diff --db-url <wev-test-db-url> --schema public`
- Confirm the diff is empty before touching prod

## 6. Safety notes

- The prepared migration is schema-only: it does not update, delete, or rewrite user/application data rows
- Constraint changes can still fail if existing data violates the current branch limits, which is why the preflight matters
- The RLS / policy / FK / index cleanup is intentionally called out separately because it changes security / integrity behavior, even though it is part of exact branch alignment
