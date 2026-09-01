-- Address Supabase security linter findings:
--   * RLS disabled on job_match_recalc_queue
--   * RLS enabled but no policy on job_skills
--   * SECURITY DEFINER RPCs callable by anon/authenticated

--------------------------------------------------------------------------------
-- 1. job_match_recalc_queue — internal worker queue (service_role + triggers only)
--------------------------------------------------------------------------------

alter table public.job_match_recalc_queue enable row level security;

-- Re-assert table grants: service_role bypasses RLS; anon/authenticated have none.
grant select, insert, update, delete on public.job_match_recalc_queue to service_role;

-- Workers access the queue via:
--   * SECURITY DEFINER enqueue/drain functions (owned by postgres; bypass RLS)
--   * service_role direct table access (bypasses RLS)
-- Triggers call enqueue via SECURITY DEFINER trigger_recalculate_job_matches().

--------------------------------------------------------------------------------
-- 2. job_skills — shared job metadata, public read (like esco_skills)
--------------------------------------------------------------------------------

-- Columns are non-PII: job_id, skill_id, score, source, created_at.
-- Same data is already public on jobs.skills and esco_skills labels.
create policy "Allow public read access for job_skills"
  on public.job_skills for select
  using (true);

grant select on public.job_skills to anon, authenticated;

comment on table public.job_skills is
  'ESCO skill tags per job (job_id, skill_id, score, source, created_at). '
  'No PII — public read mirrors jobs.skills and esco_skills.';

--------------------------------------------------------------------------------
-- 3. Lock down SECURITY DEFINER RPCs to intended roles
--
-- CREATE OR REPLACE resets EXECUTE to PUBLIC. Any migration that replaces one
-- of these functions must end with:  select public.apply_restricted_rpc_grants();
--------------------------------------------------------------------------------

create or replace function public.apply_restricted_rpc_grants()
returns void
language plpgsql
set search_path = public
as $func$
begin
  -- Scraper seeder only
  revoke all on function public.bulk_update_skill_embeddings(jsonb) from public, anon, authenticated;
  grant execute on function public.bulk_update_skill_embeddings(jsonb) to service_role;

  -- Bulletin match-calculator (supabaseServer) and pg_cron worker only
  revoke all on function public.recalculate_matches_for_user(uuid) from public, anon, authenticated;
  grant execute on function public.recalculate_matches_for_user(uuid) to service_role;

  revoke all on function public.recalculate_matches_for_job(uuid) from public, anon, authenticated;
  grant execute on function public.recalculate_matches_for_job(uuid) to service_role;

  revoke all on function public.enqueue_job_match_recalc(uuid) from public, anon, authenticated;
  grant execute on function public.enqueue_job_match_recalc(uuid) to service_role;

  revoke all on function public.process_job_match_recalc_queue(int, int, text, int)
    from public, anon, authenticated;
  grant execute on function public.process_job_match_recalc_queue(int, int, text, int)
    to service_role;

  -- Maintenance / restore helpers
  revoke all on function public.purge_request_logs() from public, anon, authenticated;
  grant execute on function public.purge_request_logs() to service_role;

  revoke all on function public.reset_restore_identity_sequences() from public, anon, authenticated;
  grant execute on function public.reset_restore_identity_sequences() to service_role;

  -- Trigger bodies — not intended as public RPCs
  revoke all on function public.trigger_recalculate_job_matches() from public, anon, authenticated;
  revoke all on function public.trigger_recalculate_user_matches() from public, anon, authenticated;

  -- Authenticated users only (checks auth.uid() internally)
  revoke all on function public.verify_user_password(text) from public, anon;
  grant execute on function public.verify_user_password(text) to authenticated;

  -- Auth hook (may exist on hosted projects only)
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_auth_user_created'
      and p.pronargs = 0
  ) then
    revoke all on function public.handle_auth_user_created() from public, anon, authenticated;
  end if;
end;
$func$;

-- Migration-only helper: not callable via PostgREST
revoke all on function public.apply_restricted_rpc_grants() from public, anon, authenticated, service_role;

select public.apply_restricted_rpc_grants();

comment on function public.apply_restricted_rpc_grants() is
  'Re-applies EXECUTE grants on internal SECURITY DEFINER RPCs. '
  'Call via migration after any CREATE OR REPLACE on those functions.';
