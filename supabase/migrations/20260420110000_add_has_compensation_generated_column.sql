-- Add a computed salary-availability flag so PostgREST filters can avoid fragile OR strings.
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS has_compensation boolean GENERATED ALWAYS AS (
  nullif(btrim(coalesce(wage, '')), '') IS NOT NULL OR min_value IS NOT NULL
) STORED;
CREATE INDEX IF NOT EXISTS jobs_has_compensation_date_posted_idx
  ON public.jobs (has_compensation, date_posted DESC);
-- Recreate view so j.* re-expands and includes the newly-added generated column.
DROP VIEW IF EXISTS public.matched_jobs;
CREATE VIEW public.matched_jobs WITH (security_invoker = true) AS
SELECT
  j.*,
  s.name AS source,
  COALESCE(jm.score, 0) AS match_score,
  COALESCE(jm.value_score, 0) AS value_score,
  COALESCE(jm.skill_score, 0) AS skill_score
FROM public.jobs j
LEFT JOIN public.sources s ON j.source_id = s.id
LEFT JOIN public.job_matches jm
  ON j.id = jm.job_id
  AND jm.user_id = auth.uid();
