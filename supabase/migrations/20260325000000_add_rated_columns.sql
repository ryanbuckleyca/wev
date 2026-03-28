-- Add values_rated and skills_rated JSONB columns for rank-based prioritisation.
--
-- profiles.values_rated: [{ "value": "...", "rank": 1 }, { "value": "..." }, ...]
-- profiles.skills_rated: [{ "skill": "<ESCO URI>", "rank": 1 }, ...]
-- jobs.values_rated:     [{ "value": "...", "confidence": 1 }, ...]

--------------------------------------------------------------------------------
-- 1. Add columns (non-blocking, idempotent)
--------------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS values_rated jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skills_rated jsonb;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS values_rated jsonb;
