-- Restore max 10 canonical skills per profile (product policy: 10 skills, 5 values).
-- Replaces `profiles_skills_max_5_check` from 202603081700_profiles_skills_max_5.sql.

UPDATE public.profiles
SET skills = skills[1:10]
WHERE array_length(skills, 1) > 10;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_skills_max_5_check;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_skills_max_10_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_skills_max_10_check
  CHECK (coalesce(array_length(skills, 1), 0) <= 10);
