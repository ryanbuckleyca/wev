-- Read-only preflight for 20260328160000_reconcile_schema_to_current_branch.sql
-- Safe to run on wev-test / wev-prod. No data mutations.

--------------------------------------------------------------------------------
-- 1. Summary: rows that would violate current-branch constraints
--------------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE coalesce(array_length(skills, 1), 0) > 10) AS profiles_skills_over_10,
  count(*) FILTER (WHERE coalesce(array_length("values", 1), 0) > 5) AS profiles_values_over_5,
  count(*) FILTER (
    WHERE skills_rated IS NOT NULL
      AND (
        jsonb_typeof(skills_rated) <> 'array'
        OR jsonb_array_length(skills_rated) > 10
      )
  ) AS profiles_skills_rated_invalid,
  count(*) FILTER (
    WHERE values_rated IS NOT NULL
      AND (
        jsonb_typeof(values_rated) <> 'array'
        OR jsonb_array_length(values_rated) > 5
      )
  ) AS profiles_values_rated_invalid
FROM public.profiles;

SELECT
  count(*) FILTER (WHERE coalesce(array_length(skills, 1), 0) > 10) AS jobs_skills_over_10,
  count(*) FILTER (
    WHERE values_rated IS NOT NULL
      AND jsonb_typeof(values_rated) <> 'array'
  ) AS jobs_values_rated_not_array
FROM public.jobs;

--------------------------------------------------------------------------------
-- 2. Detail: offending profile rows
--------------------------------------------------------------------------------
SELECT
  id,
  coalesce(array_length(skills, 1), 0) AS skills_count,
  coalesce(array_length("values", 1), 0) AS values_count,
  CASE
    WHEN skills_rated IS NULL THEN NULL
    ELSE jsonb_typeof(skills_rated)
  END AS skills_rated_type,
  CASE
    WHEN skills_rated IS NULL OR jsonb_typeof(skills_rated) <> 'array' THEN NULL
    ELSE jsonb_array_length(skills_rated)
  END AS skills_rated_count,
  CASE
    WHEN values_rated IS NULL THEN NULL
    ELSE jsonb_typeof(values_rated)
  END AS values_rated_type,
  CASE
    WHEN values_rated IS NULL OR jsonb_typeof(values_rated) <> 'array' THEN NULL
    ELSE jsonb_array_length(values_rated)
  END AS values_rated_count
FROM public.profiles
WHERE
  coalesce(array_length(skills, 1), 0) > 10
  OR coalesce(array_length("values", 1), 0) > 5
  OR (
    skills_rated IS NOT NULL
    AND (
      jsonb_typeof(skills_rated) <> 'array'
      OR jsonb_array_length(skills_rated) > 10
    )
  )
  OR (
    values_rated IS NOT NULL
    AND (
      jsonb_typeof(values_rated) <> 'array'
      OR jsonb_array_length(values_rated) > 5
    )
  )
ORDER BY id;

--------------------------------------------------------------------------------
-- 3. Detail: offending job rows
--------------------------------------------------------------------------------
SELECT
  id,
  coalesce(array_length(skills, 1), 0) AS skills_count,
  CASE
    WHEN values_rated IS NULL THEN NULL
    ELSE jsonb_typeof(values_rated)
  END AS values_rated_type,
  CASE
    WHEN values_rated IS NULL OR jsonb_typeof(values_rated) <> 'array' THEN NULL
    ELSE jsonb_array_length(values_rated)
  END AS values_rated_count
FROM public.jobs
WHERE
  coalesce(array_length(skills, 1), 0) > 10
  OR (
    values_rated IS NOT NULL
    AND jsonb_typeof(values_rated) <> 'array'
  )
ORDER BY id;

--------------------------------------------------------------------------------
-- 4. Shape checks: malformed rank / confidence entries that would break casts
--------------------------------------------------------------------------------
SELECT
  p.id AS profile_id,
  elem AS bad_values_rated_entry
FROM public.profiles p
CROSS JOIN LATERAL jsonb_array_elements(coalesce(p.values_rated, '[]'::jsonb)) AS elem
WHERE
  jsonb_typeof(coalesce(p.values_rated, '[]'::jsonb)) = 'array'
  AND (
    (elem ? 'rank' AND nullif(elem->>'rank', '') IS NOT NULL AND (elem->>'rank') !~ '^[0-9]+$')
    OR (elem ? 'value' AND nullif(elem->>'value', '') IS NULL)
  )
ORDER BY p.id;

SELECT
  j.id AS job_id,
  elem AS bad_values_rated_entry
FROM public.jobs j
CROSS JOIN LATERAL jsonb_array_elements(coalesce(j.values_rated, '[]'::jsonb)) AS elem
WHERE
  jsonb_typeof(coalesce(j.values_rated, '[]'::jsonb)) = 'array'
  AND (
    (elem ? 'confidence' AND nullif(elem->>'confidence', '') IS NOT NULL AND (elem->>'confidence') !~ '^[0-9]+$')
    OR (elem ? 'value' AND nullif(elem->>'value', '') IS NULL)
  )
ORDER BY j.id;

SELECT
  p.id AS profile_id,
  elem AS bad_skills_rated_entry
FROM public.profiles p
CROSS JOIN LATERAL jsonb_array_elements(coalesce(p.skills_rated, '[]'::jsonb)) AS elem
WHERE
  jsonb_typeof(coalesce(p.skills_rated, '[]'::jsonb)) = 'array'
  AND (
    (elem ? 'rank' AND nullif(elem->>'rank', '') IS NOT NULL AND (elem->>'rank') !~ '^[0-9]+$')
    OR (elem ? 'skill' AND nullif(elem->>'skill', '') IS NULL)
  )
ORDER BY p.id;

--------------------------------------------------------------------------------
-- 5. Schema snapshot: legacy objects we expect to remove or replace
--------------------------------------------------------------------------------
SELECT conname
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE
  n.nspname = 'public'
  AND t.relname = 'profiles'
  AND conname IN (
    'profiles_skills_max_5_check',
    'profiles_skills_max_10_check',
    'profiles_skills_rated_max_10_check',
    'profiles_values_max_5_check',
    'profiles_values_rated_max_5_check'
  )
ORDER BY conname;

SELECT
  proname,
  oidvectortypes(proargtypes) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE
  n.nspname = 'public'
  AND proname IN (
    'value_tier_weight',
    'rank_weight',
    'job_confidence_weight',
    'recalculate_matches_for_job',
    'recalculate_matches_for_user',
    'trigger_recalculate_job_matches',
    'trigger_recalculate_user_matches',
    'rls_auto_enable'
  )
ORDER BY proname, args;

SELECT
  event_object_table AS table_name,
  trigger_name
FROM information_schema.triggers
WHERE
  trigger_schema = 'public'
  AND event_object_table IN ('jobs', 'profiles')
ORDER BY event_object_table, trigger_name;

SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE
  schemaname = 'public'
  AND tablename IN ('profiles', 'user_roles', 'job_matches')
ORDER BY tablename, policyname;

SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE
  n.nspname = 'public'
  AND relname IN (
    'jobs',
    'organizations',
    'scrape_runs',
    'sources',
    'user_roles',
    'profiles',
    'job_matches'
  )
ORDER BY relname;

SELECT evtname, evtevent, evttags
FROM pg_event_trigger
ORDER BY evtname;
