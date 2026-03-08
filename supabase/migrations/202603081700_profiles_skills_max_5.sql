-- Reduce maximum canonical skills per profile from 10 to 5
-- 1) Truncate any existing arrays to five entries
-- 2) Replace the check constraint to enforce the new limit

UPDATE public.profiles
SET skills = skills[1:5]
WHERE array_length(skills, 1) > 5;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_skills_max_10_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_skills_max_5_check
  CHECK (coalesce(array_length(skills, 1), 0) <= 5);
