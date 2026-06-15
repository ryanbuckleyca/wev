-- Grant table-level permissions to Supabase roles.
--
-- Previously, tables had RLS policies but no GRANT statements. Hosted Supabase
-- applies default grants automatically, but local Supabase (via `supabase start`)
-- does not — causing "permission denied for table <X>" errors even with the
-- service_role key.
--
-- service_role: full CRUD on all tables (used by the scraper and admin tasks).
-- anon/authenticated: SELECT on public-facing tables (matches RLS policies).

-- ============================================================
-- 1. service_role — full access (scraper, admin scripts, RPCs)
-- ============================================================
GRANT ALL ON TABLE public.jobs           TO service_role;
GRANT ALL ON TABLE public.sources        TO service_role;
GRANT ALL ON TABLE public.scrape_runs    TO service_role;
GRANT ALL ON TABLE public.organizations  TO service_role;
GRANT ALL ON TABLE public.profiles       TO service_role;
GRANT ALL ON TABLE public.job_matches    TO service_role;
GRANT ALL ON TABLE public.bookmarks      TO service_role;
GRANT ALL ON TABLE public.esco_skills    TO service_role;
GRANT ALL ON TABLE public.cities         TO service_role;
GRANT ALL ON TABLE public.user_roles     TO service_role;
GRANT ALL ON TABLE public.job_skills     TO service_role;
GRANT ALL ON TABLE public.matched_jobs   TO service_role;

-- ============================================================
-- 2. anon — public read (matches existing RLS SELECT policies)
-- ============================================================
GRANT SELECT ON TABLE public.jobs           TO anon;
GRANT SELECT ON TABLE public.sources        TO anon;
GRANT SELECT ON TABLE public.scrape_runs    TO anon;
GRANT SELECT ON TABLE public.organizations  TO anon;
GRANT SELECT ON TABLE public.esco_skills    TO anon;
GRANT SELECT ON TABLE public.cities         TO anon;
GRANT SELECT ON TABLE public.matched_jobs   TO anon;

-- ============================================================
-- 3. authenticated — read public tables + CRUD on own data
--    (row-level enforcement is handled by RLS policies)
-- ============================================================
GRANT SELECT ON TABLE public.jobs           TO authenticated;
GRANT SELECT ON TABLE public.sources        TO authenticated;
GRANT SELECT ON TABLE public.scrape_runs    TO authenticated;
GRANT SELECT ON TABLE public.organizations  TO authenticated;
GRANT SELECT ON TABLE public.esco_skills    TO authenticated;
GRANT SELECT ON TABLE public.cities         TO authenticated;
GRANT SELECT ON TABLE public.matched_jobs   TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bookmarks   TO authenticated;
GRANT SELECT ON TABLE public.job_matches TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO authenticated;
