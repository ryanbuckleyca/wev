-- Create a View that automatically LEFT JOINs a user's match scores onto jobs.
-- auth.uid() resolves the requesting user for RLS-aware queries (per-request client).
-- For anonymous users, auth.uid() is NULL → LEFT JOIN produces NULLs → COALESCE gives 0.
-- Uses j.* so all current and future jobs columns are inherited automatically.

CREATE OR REPLACE VIEW public.jobs_with_match_scores AS
SELECT
  j.*,
  s.name                                    AS source_name,
  COALESCE(jm.score, 0)::numeric            AS match_score,
  COALESCE(jm.value_score, 0)::numeric      AS match_value_score,
  COALESCE(jm.skill_score, 0)::numeric      AS match_skill_score,
  COALESCE(jm.work_type_score, 0)::numeric  AS match_work_type_score,
  COALESCE(jm.location_score, 0)::numeric   AS match_location_score
FROM public.jobs j
LEFT JOIN public.sources s ON s.id = j.source_id
LEFT JOIN public.job_matches jm
  ON jm.job_id = j.id
  AND jm.user_id = auth.uid();

-- The View inherits the SELECT RLS policies from the underlying tables.
-- No separate RLS policy is needed on a View (they are not tables).
COMMENT ON VIEW public.jobs_with_match_scores IS
  'Denormalised job listing with the requesting user''s match scores attached via LEFT JOIN. '
  'Used by the bulletin API for server-side filtering, sorting, and pagination.';
