-- Resolve Supabase security-linter findings:
--   1. RLS disabled on public.job_match_recalc_queue (internal worker queue).
--   2. RLS enabled but no policy on public.job_skills, so PostgREST reads return nothing.
--   3. Internal SECURITY DEFINER RPCs are executable by anon/authenticated.
--
-- On (3): a new function in public is reachable by the PostgREST roles by default,
-- both from the built-in PUBLIC EXECUTE grant and from Supabase's own default ACLs
-- (see pg_default_acl for supabase_admin/public/functions). ALTER DEFAULT PRIVILEGES
-- does not reliably suppress that on the Supabase image, so an explicit revoke is the
-- only dependable control. Rather than hand-maintain revoke/grant pairs per signature,
-- the intended audience of every SECURITY DEFINER RPC is declared once in
-- private.restricted_rpc and applied by private.apply_restricted_rpc_grants().
--
-- Note on CREATE OR REPLACE: replacing a function preserves its owner and ACL, so a
-- plain CREATE OR REPLACE does not reopen access. Grants are reset only when a function
-- is DROPped and recreated (required to change its signature or return type). That is
-- the case that needs the helper re-run, and supabase/tests/restricted_rpc_grants.test.sql
-- fails the build if any migration leaves the end state wrong, however it was written.

--------------------------------------------------------------------------------
-- 1. job_match_recalc_queue — internal worker queue
--------------------------------------------------------------------------------
--
-- Table grants for service_role already ship with the queue's own migration
-- (20260820100000_async_job_match_recalc.sql) and are intentionally left alone here.
-- The enqueue/drain RPCs are SECURITY DEFINER and owned by postgres, so they operate
-- on the queue regardless of RLS.

alter table public.job_match_recalc_queue enable row level security;

drop policy if exists "No direct client access to job_match_recalc_queue"
  on public.job_match_recalc_queue;

create policy "No direct client access to job_match_recalc_queue"
  on public.job_match_recalc_queue
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.job_match_recalc_queue is
  'Async job-match recalc worker queue. anon/authenticated are denied by RLS; '
  'service_role bypasses RLS; workers go through SECURITY DEFINER RPCs.';

--------------------------------------------------------------------------------
-- 2. job_skills — public read, mirroring esco_skills
--------------------------------------------------------------------------------
--
-- Columns are job_id, skill_id, score, source, created_at: no PII, and the same
-- information is already public via jobs.skills and esco_skills labels.

drop policy if exists "Allow public read access for job_skills" on public.job_skills;

create policy "Allow public read access for job_skills"
  on public.job_skills for select
  using (true);

grant select on public.job_skills to anon, authenticated;

comment on table public.job_skills is
  'ESCO skill tags per job (job_id, skill_id, score, source, created_at). '
  'No PII — public read mirrors jobs.skills and esco_skills.';

--------------------------------------------------------------------------------
-- 3. Restricted RPC registry
--------------------------------------------------------------------------------

create schema if not exists private;

comment on schema private is
  'Internal helpers and metadata that must never be reachable through PostgREST. '
  'Not listed in config.toml api.schemas, and no USAGE granted to client roles.';

revoke all on schema private from public;
revoke all on schema private from anon, authenticated, service_role;

-- Single source of truth for who may execute each internal RPC. Both the grant
-- applier below and supabase/tests/restricted_rpc_grants.test.sql read this table, so
-- the list cannot drift out of sync with what CI enforces.
create table if not exists private.restricted_rpc (
  function_name text primary key,
  allowed_roles text[] not null default '{}'::text[],
  is_optional boolean not null default false,
  rationale text not null
);

comment on table private.restricted_rpc is
  'Declares the intended EXECUTE audience of every SECURITY DEFINER function in public. '
  'allowed_roles is exhaustive: any role not listed must not hold EXECUTE. '
  'is_optional marks functions that exist only on hosted projects. CI asserts that every '
  'SECURITY DEFINER function in public appears here, so new ones must be classified.';

-- This migration is the authoritative baseline for the manifest, so the seed below is a
-- full replacement rather than an upsert: removing a row from this file removes it from
-- the database. That is safe because migrations apply exactly once, and because a later
-- migration adding an entry runs after this one both on a fresh `supabase db reset` and
-- on an incremental deploy. Any future migration that maintains the manifest should
-- insert or upsert its own rows and must not delete.
delete from private.restricted_rpc;

insert into private.restricted_rpc (function_name, allowed_roles, is_optional, rationale)
values
  ('bulk_update_skill_embeddings', '{service_role}', false,
   'ESCO embedding seeder in wev-scraper.'),

  ('recalculate_matches_for_user', '{service_role}', false,
   'Match calculator via supabaseServer, and the pg_cron drain worker.'),

  ('recalculate_matches_for_job', '{service_role}', false,
   'Match calculator via supabaseServer, and the pg_cron drain worker.'),

  ('enqueue_job_match_recalc', '{service_role}', false,
   'Scraper and admin paths enqueue recalcs after match-relevant column changes.'),

  ('process_job_match_recalc_queue', '{service_role}', false,
   'Queue drain worker; called by pg_cron and admin tooling.'),

  ('purge_request_logs', '{service_role}', false,
   'Scheduled retention job for request_logs.'),

  ('reset_restore_identity_sequences', '{service_role}', false,
   'Restore-time maintenance helper.'),

  ('get_auth_user_id_by_email', '{service_role}', false,
   'Maps email to auth user id for server-side tooling; must never be client callable.'),

  ('verify_user_password', '{authenticated}', false,
   'Sole caller is wev-bulletin/lib/account/password-verifier.ts using a server client '
   'with the user JWT; the function raises when auth.uid() is null. Signup and password '
   'reset go through GoTrue and do not use this RPC.'),

  ('trigger_recalculate_job_matches', '{}', false,
   'Trigger body only — never a callable RPC.'),

  ('trigger_recalculate_user_matches', '{}', false,
   'Trigger body only — never a callable RPC.'),

  ('handle_auth_user_created', '{}', true,
   'Auth hook body, present on hosted projects only — never a callable RPC.');

--------------------------------------------------------------------------------
-- 4. Grant applier
--------------------------------------------------------------------------------
--
-- Resolves each manifest entry through pg_proc rather than a written-out signature, so
-- every overload is covered and a rename or signature change cannot silently no-op.
-- Deliberately NOT security definer: only a function's owner may change its ACL, and
-- migrations already run as that owner (postgres). Making it security definer would turn
-- any future EXECUTE grant on it into a privilege-escalation path.

create or replace function private.apply_restricted_rpc_grants()
returns void
language plpgsql
set search_path = pg_catalog, public
as $func$
declare
  entry    record;
  target   record;
  resolved int;
  grantee  text;
  drift    text[];
begin
  for entry in
    select function_name, allowed_roles, is_optional
    from private.restricted_rpc
    order by function_name
  loop
    resolved := 0;

    for target in
      select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = entry.function_name
    loop
      resolved := resolved + 1;

      execute format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        target.signature
      );

      foreach grantee in array entry.allowed_roles loop
        execute format('grant execute on function %s to %I', target.signature, grantee);
      end loop;
    end loop;

    if resolved = 0 and not entry.is_optional then
      raise exception
        'restricted RPC manifest lists public.% but no such function exists', entry.function_name
        using hint = 'Drop the manifest row, or set is_optional, if the function was renamed or removed.';
    end if;
  end loop;

  -- Fail the migration rather than leaving a half-applied grant set behind.
  select array_agg(
           format('%s: %s should%s hold EXECUTE',
                  d.signature, d.grantee, case when d.expected then '' else ' not' end)
           order by d.signature, d.grantee
         )
    into drift
  from (
    select p.oid::regprocedure::text                          as signature,
           r.grantee                                          as grantee,
           r.grantee = any(m.allowed_roles)                   as expected,
           has_function_privilege(r.grantee, p.oid, 'EXECUTE') as actual
    from private.restricted_rpc m
    join pg_proc p on p.proname = m.function_name
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    cross join (values ('anon'), ('authenticated'), ('service_role')) as r(grantee)
  ) d
  where d.expected is distinct from d.actual;

  if drift is not null then
    raise exception 'restricted RPC grants did not apply cleanly: %',
      array_to_string(drift, '; ');
  end if;
end;
$func$;

comment on function private.apply_restricted_rpc_grants() is
  'Applies private.restricted_rpc to every matching overload in public, then verifies the '
  'result and raises on mismatch. Owner-only by design: migrations run as postgres. Re-run '
  'it from any migration that DROPs and recreates a restricted RPC.';

revoke all on function private.apply_restricted_rpc_grants()
  from public, anon, authenticated, service_role;

select private.apply_restricted_rpc_grants();
