-- Fix try_parse_job_date_posted for date-only strings (e.g. '2026-07-06').
--
-- 20260709000000 used make_timestamptz(date, time, timezone), which does not
-- exist in Postgres. The exception handler returned NULL for every seeder /
-- scraper date-only value, so get_active_organizations always returned 0 orgs.

CREATE OR REPLACE FUNCTION public.try_parse_job_date_posted(p_date text)
RETURNS timestamp with time zone
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_year int;
  v_month int;
  v_day int;
  v_normalized text;
BEGIN
  IF p_date IS NULL OR btrim(p_date) = '' THEN
    RETURN NULL;
  END IF;

  -- Date-only strings (seeders / many scrape sources).
  IF p_date ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' THEN
    v_year := substring(p_date from 1 for 4)::int;
    v_month := substring(p_date from 6 for 2)::int;
    v_day := substring(p_date from 9 for 2)::int;
    BEGIN
      RETURN make_timestamptz(v_year, v_month, v_day, 0, 0, 0.0, 'UTC');
    EXCEPTION
      WHEN OTHERS THEN
        RETURN NULL;
    END;
  END IF;

  -- Datetime strings with timezone (ISO-8601).
  IF p_date ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]\d{2}(:\d{2})?)$' THEN
    BEGIN
      RETURN p_date::timestamp with time zone;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN NULL;
    END;
  END IF;

  -- Datetime without timezone suffix: treat as UTC.
  IF p_date ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?$' THEN
    v_normalized := p_date || 'Z';
    BEGIN
      RETURN v_normalized::timestamp with time zone;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN NULL;
    END;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.try_parse_job_date_posted(text) IS
  'Safely parse jobs.date_posted text to timestamptz. Returns NULL for empty or unparseable values.';

-- The partial expression index was populated with the OLD (broken) function,
-- which returned NULL for every row, so the `... IS NOT NULL` predicate excluded
-- all rows and the index is effectively empty. Postgres does not recompute
-- expression indexes when an IMMUTABLE function body changes, so rebuild it.
--
-- DROP + CREATE INDEX blocks writes during the rebuild but keeps reads available,
-- which is strictly less disruptive than REINDEX (ACCESS EXCLUSIVE blocks reads
-- too). On a very large jobs table, skip this and instead rebuild in a
-- maintenance window with CREATE INDEX CONCURRENTLY (cannot run inside the
-- migration transaction).
DROP INDEX IF EXISTS public.jobs_org_id_parsed_date_posted_idx;

CREATE INDEX IF NOT EXISTS jobs_org_id_parsed_date_posted_idx
  ON public.jobs (organization_id, try_parse_job_date_posted(date_posted))
  WHERE organization_id IS NOT NULL
    AND try_parse_job_date_posted(date_posted) IS NOT NULL;

COMMENT ON INDEX jobs_org_id_parsed_date_posted_idx IS
  'Supports get_active_organizations: JOIN on organization_id + filter by parsed date_posted.';
