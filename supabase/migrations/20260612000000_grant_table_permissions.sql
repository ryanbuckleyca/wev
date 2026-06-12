-- Grant table-level permissions to authenticated and anon roles.
--
-- Supabase hosted environments apply these grants automatically, but the local
-- Docker stack and CI do not. Without them, the authenticated role gets
-- "permission denied for table X" even when RLS policies would otherwise allow
-- access. RLS enforces row-level visibility; GRANTs are the prerequisite that
-- lets the role see the table at all.
--
-- Rule of thumb:
--   anon      → SELECT only on publicly readable tables (jobs, sources, etc.)
--   authenticated → full DML on tables they own rows in; SELECT on shared tables

-- ── Shared / publicly readable ───────────────────────────────────────────────

grant select on public.jobs              to anon, authenticated;
grant select on public.sources           to anon, authenticated;
grant select on public.organizations     to anon, authenticated;
grant select on public.esco_skills       to anon, authenticated;
grant select on public.scrape_runs       to anon, authenticated;

-- ── User-owned tables ────────────────────────────────────────────────────────

-- profiles: users manage their own row; RLS restricts to owner
grant select, insert, update, delete on public.profiles     to authenticated;

-- job_matches: written by server-side functions, read by owner
grant select on public.job_matches to authenticated;

-- bookmarks: full ownership
grant select, insert, update, delete on public.bookmarks    to authenticated;

-- request_logs: written by verify_user_password (security definer), read by owner
grant select on public.request_logs to authenticated;
