-- Repair migration to ensure profile work preference columns exist.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS work_types text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ideal_work_environment text;

UPDATE public.profiles
  SET work_types = '{}'::text[]
  WHERE work_types IS NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_work_types_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_work_types_check
  CHECK (work_types <@ ARRAY['remote'::text, 'hybrid'::text, 'office'::text]);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_work_environment_length_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_work_environment_length_check
  CHECK (ideal_work_environment IS NULL OR char_length(ideal_work_environment) <= 1500);
