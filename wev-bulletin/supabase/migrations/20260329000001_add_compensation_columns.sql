-- Migration: Add structured compensation columns to public.jobs
-- Phase 1 — Database Foundation
-- All columns default to NULL so existing rows are unaffected.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS unit_text        text;
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS min_value        bigint;
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS max_value        bigint;
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS hours_per_week   integer;
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS compensation_meta jsonb;
-- annualize_v1: converts a compensation amount + unit to an annual CAD-cent value.
-- Declared IMMUTABLE so it can be used in functional index definitions (Requirement 2.9).
CREATE OR REPLACE FUNCTION annualize_v1(
  amount bigint,
  unit text,
  actual_hours_per_week integer DEFAULT NULL
) RETURNS bigint LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE unit
    WHEN 'HOUR'  THEN amount * COALESCE(actual_hours_per_week::bigint * 52, 2080)
    WHEN 'DAY'   THEN amount * 260
    WHEN 'WEEK'  THEN amount * 52
    WHEN 'MONTH' THEN amount * 12
    WHEN 'YEAR'  THEN amount
    ELSE NULL
  END
$$;
-- Data integrity constraints (NOT VALID — apply to new rows only; validate after backfill)

-- 3.1: unit_text must be one of the five valid values when not null
ALTER TABLE public.jobs ADD CONSTRAINT compensation_unit_check
  CHECK (unit_text IS NULL OR unit_text IN ('HOUR','DAY','WEEK','MONTH','YEAR'))
  NOT VALID;
-- 3.2: unit_text and min_value must be both null or both non-null (with min_value >= 0)
ALTER TABLE public.jobs ADD CONSTRAINT compensation_integrity_check
  CHECK (
    (unit_text IS NULL AND min_value IS NULL)
    OR (unit_text IS NOT NULL AND min_value IS NOT NULL AND min_value >= 0)
  )
  NOT VALID;
-- 3.3: max_value must be >= min_value when present
ALTER TABLE public.jobs ADD CONSTRAINT compensation_range_check
  CHECK (max_value IS NULL OR max_value >= min_value)
  NOT VALID;
-- 3.4: zero min_value is only permitted for VOLUNTEER, INTERN, or STAGE employment types
ALTER TABLE public.jobs ADD CONSTRAINT compensation_zero_salary_check
  CHECK (
    min_value IS NULL
    OR min_value > 0
    OR (min_value = 0 AND employment_type IN ('VOLUNTEER','INTERN','STAGE'))
  )
  NOT VALID;
-- 3.5: hours_per_week must be between 1 and 80 when present
ALTER TABLE public.jobs ADD CONSTRAINT compensation_hours_check
  CHECK (hours_per_week IS NULL OR hours_per_week BETWEEN 1 AND 80)
  NOT VALID;
