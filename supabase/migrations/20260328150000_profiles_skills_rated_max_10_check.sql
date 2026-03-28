-- Enforce max 10 skills_rated entries per profile (matches MAX_PROFILE_SKILLS in useProfileForm.tsx).
-- Mirrors `20260328130000_profiles_values_max_5_check.sql` for values_rated.

--------------------------------------------------------------------------------
-- CHECK constraint
--------------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_skills_rated_max_10_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_skills_rated_max_10_check
  CHECK (
    skills_rated IS NULL
    OR (
      jsonb_typeof(skills_rated) = 'array'
      AND jsonb_array_length(skills_rated) <= 10
    )
  );
