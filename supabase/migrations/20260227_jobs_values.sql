-- Add job-level values tags (string array).
-- Intentionally minimal: only this single column.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS "values" text[] NOT NULL DEFAULT '{}'::text[];
