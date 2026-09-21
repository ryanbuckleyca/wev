-- Expose organization type/sector on matched_jobs so the Jobs board can filter
-- with small facet params (same idea as get_active_organizations p_org_types /
-- p_sectors) instead of expanding to a huge organization_id IN list.

DROP VIEW IF EXISTS public.matched_jobs;

CREATE VIEW public.matched_jobs WITH (security_invoker = true) AS
SELECT
  j.*,
  s.name AS source,
  o.type AS org_type,
  o.sector_id AS org_sector_id,
  COALESCE(jm.score, 0) AS match_score,
  COALESCE(jm.value_score, 0) AS value_score,
  COALESCE(jm.skill_score, 0) AS skill_score
FROM public.jobs j
LEFT JOIN public.sources s ON j.source_id = s.id
LEFT JOIN public.organizations o ON j.organization_id = o.id
LEFT JOIN public.job_matches jm
  ON j.id = jm.job_id
  AND jm.user_id = auth.uid();

GRANT SELECT ON public.matched_jobs TO anon, authenticated, service_role;

COMMENT ON VIEW public.matched_jobs IS
  'Jobs with source name, match scores, and org type/sector for bulletin facet filters.';
