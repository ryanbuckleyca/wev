-- Add a stored generated column for accent-insensitive municipality search.
-- This ensures that filtering for "Montreal" finds "Montréal" and vice versa.

ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS search_municipality text 
GENERATED ALWAYS AS (public.f_unaccent(lower(municipality))) STORED;

-- Create an index to optimise filter queries
CREATE INDEX IF NOT EXISTS idx_jobs_search_municipality 
ON public.jobs (search_municipality);

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
