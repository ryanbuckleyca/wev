-- Add values_rated and skills_rated JSONB columns for rank-based prioritisation.
--
-- profiles.values_rated: [{ "value": "...", "rank": 1 }, { "value": "..." }, ...]
-- profiles.skills_rated: [{ "skill": "<ESCO URI>", "rank": 1 }, ...]
-- jobs.values_rated:     [{ "value": "...", "confidence": 1 }, ...]
--
-- Backfills existing profiles.values and jobs.values into the new columns.

--------------------------------------------------------------------------------
-- 1. Add columns (non-blocking, idempotent)
--------------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS values_rated jsonb;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skills_rated jsonb;
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS values_rated jsonb;
--------------------------------------------------------------------------------
-- 2. Backfill profiles.values_rated from profiles.values
--    Existing values get no rank (unranked = neutral weight in matching).
--------------------------------------------------------------------------------
UPDATE public.profiles
SET values_rated = (
  SELECT jsonb_agg(jsonb_build_object('value', v))
  FROM unnest("values") AS v
)
WHERE "values" IS NOT NULL
  AND array_length("values", 1) > 0
  AND values_rated IS NULL;
--------------------------------------------------------------------------------
-- 3. Backfill jobs.values_rated from jobs.values
--    Position becomes confidence (1-based).
--------------------------------------------------------------------------------
UPDATE public.jobs
SET values_rated = (
  SELECT jsonb_agg(jsonb_build_object('value', v, 'confidence', idx) ORDER BY idx)
  FROM generate_subscripts("values", 1) AS idx,
       LATERAL (SELECT "values"[idx] AS v) AS sub
)
WHERE "values" IS NOT NULL
  AND array_length("values", 1) > 0
  AND values_rated IS NULL;
