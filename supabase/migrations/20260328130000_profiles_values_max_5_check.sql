-- Enforce max 5 work values per profile (matches MAX_PROFILE_VALUES in useProfileForm.tsx).
-- Mirrors the pattern in 20260306161200_profiles_skills_max_10.sql.

--------------------------------------------------------------------------------
-- CHECK constraints
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
