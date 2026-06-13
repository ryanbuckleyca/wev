-- Grant table-level permissions to authenticated, anon, and service_role roles.
--
-- Supabase hosted environments apply these grants automatically, but the local
-- Docker stack and CI do not. Without them, any role gets
-- "permission denied for table X" even when RLS policies would otherwise allow
-- access. RLS enforces row-level visibility; GRANTs are the prerequisite that
-- lets the role see the table at all.
--
-- Rule of thumb:
--   anon          → SELECT only on publicly readable tables (jobs, sources, etc.)
--   authenticated → full DML on tables they own rows in; SELECT on shared tables
--   service_role  → full DML on all tables so the seeder (used in CI / local
--                   dev) can clear and repopulate every table. service_role
--                   bypasses RLS but still requires table-level GRANTs in local
--                   and CI Supabase environments.

-- ── Shared / publicly readable ───────────────────────────────────────────────

grant select on public.jobs              to anon, authenticated;
grant select on public.sources           to anon, authenticated;
grant select on public.organizations     to anon, authenticated;
grant select on public.esco_skills       to anon, authenticated;
grant select on public.scrape_runs       to anon, authenticated;

-- ── Views ─────────────────────────────────────────────────────────────────────
--
-- Views require explicit GRANTs independently of the underlying tables.
-- matched_jobs uses security_invoker=true, so the calling role also needs
-- SELECT on all underlying tables (jobs, sources, job_matches).

grant select on public.matched_jobs      to anon, authenticated, service_role;

-- ── Other shared tables ───────────────────────────────────────────────────────

-- cities: read-only lookup table for location autocomplete
grant select on public.cities            to anon, authenticated, service_role;

-- ── User-owned tables ────────────────────────────────────────────────────────

-- profiles: users manage their own row; RLS restricts to owner
grant select, insert, update, delete on public.profiles     to authenticated;

-- job_matches: written by server-side functions, read by owner
-- anon needs SELECT so the security_invoker matched_jobs view can LEFT JOIN job_matches
grant select on public.job_matches to anon, authenticated;

-- bookmarks: full ownership
grant select, insert, update, delete on public.bookmarks    to authenticated;

-- request_logs: written by verify_user_password (security definer), read by owner
grant select on public.request_logs to authenticated;

-- ── service_role (seeder / admin operations) ─────────────────────────────────
--
-- The E2E seeder and any server-side admin code runs with the service_role key.
-- service_role bypasses RLS but still needs explicit table GRANTs in the local
-- Docker stack and CI (hosted Supabase grants these automatically).

grant select, insert, update, delete on public.jobs         to service_role;
grant select, insert, update, delete on public.sources      to service_role;
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.scrape_runs  to service_role;
grant select, insert, update, delete on public.profiles     to service_role;
grant select, insert, update, delete on public.user_roles   to service_role;
grant select, insert, update, delete on public.job_matches  to service_role;
grant select, insert, update, delete on public.bookmarks    to service_role;
grant select, insert, update, delete on public.esco_skills  to service_role;
grant select, insert, update, delete on public.request_logs to service_role;
