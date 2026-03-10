-- Enforce max 10 canonical skills per profile.
-- Keep existing arrays valid before adding the constraint.

UPDATE public.profiles
SET skills = skills[1:10]
WHERE array_length(skills, 1) > 10;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_skills_max_10_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_skills_max_10_check
  CHECK (coalesce(array_length(skills, 1), 0) <= 10);
