-- Create a View that automatically LEFT JOINs a user's match scores onto jobs.
-- auth.uid() resolves the requesting user for RLS-aware queries.
-- For anonymous users, auth.uid() is NULL → LEFT JOIN produces NULLs →
-- COALESCE gives 0.
-- Uses j.* so all current and future jobs columns are inherited automatically.

CREATE OR REPLACE VIEW public.jobs_with_match_scores AS
SELECT -- noqa: AM04
    j.*,
    s.name AS source_name,
    COALESCE(jm.score, 0)::NUMERIC AS match_score,
    COALESCE(jm.value_score, 0)::NUMERIC AS match_value_score,
    COALESCE(jm.skill_score, 0)::NUMERIC AS match_skill_score,
    COALESCE(jm.work_type_score, 0)::NUMERIC AS match_work_type_score,
    COALESCE(jm.location_score, 0)::NUMERIC AS match_location_score,
    public.annualize_v1(
        j.min_value, j.unit_text, j.hours_per_week
    ) AS annual_min,
    public.annualize_v1(
        j.max_value, j.unit_text, j.hours_per_week
    ) AS annual_max
FROM public.jobs AS j
LEFT JOIN public.sources AS s ON j.source_id = s.id
LEFT JOIN public.job_matches AS jm
    ON
        j.id = jm.job_id
        AND jm.user_id = auth.uid();

-- The View inherits SELECT RLS policies from the underlying tables.
-- No separate RLS policy is needed on a View (they are not tables).
COMMENT ON VIEW public.jobs_with_match_scores IS
'Denormalised job listing with the user''s match scores attached. '
'Used for server-side filtering, sorting, and pagination.';
