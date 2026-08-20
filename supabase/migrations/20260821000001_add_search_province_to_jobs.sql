-- Add a stored generated column for accent-insensitive province search.
-- This ensures that filtering for "Quebec" finds "Québec" and vice versa.

ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS search_province text 
GENERATED ALWAYS AS (public.f_unaccent(lower(province))) STORED;

-- Create an index to optimise filter queries
CREATE INDEX IF NOT EXISTS idx_jobs_search_province 
ON public.jobs (search_province);

-- Recreate the view so it includes the new column
DROP VIEW IF EXISTS matched_jobs;

CREATE VIEW matched_jobs WITH (security_invoker = true) AS
SELECT
  j.*,
  s.name AS source,
  COALESCE(jm.score, 0) AS match_score,
  COALESCE(jm.value_score, 0) AS value_score,
  COALESCE(jm.skill_score, 0) AS skill_score
FROM jobs j
LEFT JOIN sources s ON j.source_id = s.id
LEFT JOIN job_matches jm
  ON j.id = jm.job_id
  AND jm.user_id = auth.uid();

-- Re-grant SELECT permissions lost by DROP VIEW
grant select on public.matched_jobs to anon, authenticated, service_role;
