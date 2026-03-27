-- Expand migration: add values_rated JSONB columns to profiles and jobs.
-- Uses non-blocking ADD COLUMN IF NOT EXISTS (no table rewrite).
-- Backfills from existing values text[] columns.
--
-- profiles.values_rated: each string → { "value": "...", "tier": null }
-- jobs.values_rated:     each string → { "value": "...", "confidence": <1-based position> }
--
-- Requirements: 4.1, 4.2, 4.3, 4.4

--------------------------------------------------------------------------------
-- 1. Add columns (non-blocking)
--------------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS values_rated jsonb;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS values_rated jsonb;

--------------------------------------------------------------------------------
-- 2. Backfill profiles.values_rated from profiles.values
--    Each string entry → { "value": "...", "tier": null }
--------------------------------------------------------------------------------
UPDATE public.profiles
SET values_rated = (
  SELECT jsonb_agg(jsonb_build_object('value', v, 'tier', NULL))
  FROM unnest("values") AS v
)
WHERE "values" IS NOT NULL
  AND array_length("values", 1) > 0
  AND values_rated IS NULL;

--------------------------------------------------------------------------------
-- 3. Backfill jobs.values_rated from jobs.values
--    Each string entry → { "value": "...", "confidence": <1-based position> }
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
