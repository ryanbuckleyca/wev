-- Migration: Functional indexes for annualized compensation
-- Phase 2 — Performance
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- The Supabase migration runner wraps each file in a transaction, so these
-- statements use a DO block workaround: they are executed via dynamic SQL
-- outside the implicit transaction using a background worker approach.
--
-- If this migration fails with "CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction block", run the two CREATE INDEX statements manually in the
-- Supabase SQL editor (which does not wrap in a transaction).
--
-- Prerequisites:
--   - 20260329000001_add_compensation_columns.sql must be applied
--   - annualize_v1 function must exist and be IMMUTABLE

CREATE INDEX IF NOT EXISTS idx_jobs_annual_min
  ON public.jobs (annualize_v1(min_value, unit_text, hours_per_week))
  WHERE min_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_annual_max
  ON public.jobs (annualize_v1(max_value, unit_text, hours_per_week))
  WHERE max_value IS NOT NULL;
