-- Enforce max 5 work values per profile (matches MAX_PROFILE_VALUES in useProfileForm.tsx).
-- Mirrors the pattern in 202603061612_profiles_skills_max_10.sql.

--------------------------------------------------------------------------------
-- 1. Clamp existing data so ADD CONSTRAINT succeeds
--------------------------------------------------------------------------------
UPDATE public.profiles
SET "values" = "values"[1:5]
WHERE array_length("values", 1) > 5;

UPDATE public.profiles p
SET values_rated = (
  SELECT COALESCE(jsonb_agg(e ORDER BY n), '[]'::jsonb)
  FROM jsonb_array_elements(p.values_rated) WITH ORDINALITY AS t(e, n)
  WHERE n <= 5
)
WHERE p.values_rated IS NOT NULL
  AND jsonb_typeof(p.values_rated) = 'array'
  AND jsonb_array_length(p.values_rated) > 5;

--------------------------------------------------------------------------------
-- 2. CHECK constraints
--------------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_values_max_5_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_values_max_5_check
  CHECK (coalesce(array_length("values", 1), 0) <= 5);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_values_rated_max_5_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_values_rated_max_5_check
  CHECK (
    values_rated IS NULL
    OR (
      jsonb_typeof(values_rated) = 'array'
      AND jsonb_array_length(values_rated) <= 5
    )
  );
