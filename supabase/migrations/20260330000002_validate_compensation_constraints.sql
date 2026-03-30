-- Migration: Validate compensation constraints
-- Phase 3 — Data Integrity
--
-- Promotes the five NOT VALID constraints added in 20260329000001 to fully
-- validated constraints, enforcing data integrity on ALL rows including
-- historical ones.
--
-- Prerequisites:
--   - 20260329000001_add_compensation_columns.sql must be applied
--   - Backfill must be complete (zero rows with compensation_meta IS NULL)
--
-- VALIDATE CONSTRAINT acquires only a SHARE UPDATE EXCLUSIVE lock — safe on
-- a live table (reads and writes continue normally).

ALTER TABLE public.jobs VALIDATE CONSTRAINT compensation_unit_check;

ALTER TABLE public.jobs VALIDATE CONSTRAINT compensation_integrity_check;

ALTER TABLE public.jobs VALIDATE CONSTRAINT compensation_range_check;

ALTER TABLE public.jobs VALIDATE CONSTRAINT compensation_zero_salary_check;

ALTER TABLE public.jobs VALIDATE CONSTRAINT compensation_hours_check;
