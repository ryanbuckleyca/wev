-- Asserts the end state of EXECUTE privileges on internal SECURITY DEFINER RPCs.
-- Run with: supabase test db
--
-- This replaces the old supabase/scripts/check-restricted-rpc-grants.sh, which grepped
-- migrations for `CREATE OR REPLACE` on a hardcoded name list. That approach watched the
-- wrong event (replacing a function preserves its ACL; only DROP + CREATE resets it) and
-- could be evaded by formatting, schema qualification, or overloads.
--
-- These checks read the fully-migrated database instead, so any migration that leaves a
-- restricted RPC reachable fails CI regardless of how its SQL was written.

begin;

select plan(8);

-- ─── Guard against a vacuous pass ────────────────────────────────────────────
--
-- Every assertion below is set-based, so an empty manifest would make them all
-- trivially true.

select isnt_empty(
  $$select 1 from private.restricted_rpc$$,
  'restricted RPC manifest is populated'
);

-- ─── Manifest entries resolve to real functions ──────────────────────────────
--
-- Catches renames and removals: a stale manifest row would otherwise mean a
-- function silently stops being locked down.

select is_empty(
  $$
  select m.function_name
  from private.restricted_rpc m
  where not m.is_optional
    and not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = m.function_name
    )
  $$,
  'every required manifest entry resolves to a function in public'
);

-- ─── Manifest covers the whole SECURITY DEFINER surface ──────────────────────
--
-- A new SECURITY DEFINER function in public fails this until it is classified in
-- private.restricted_rpc. Public-facing ones are still allowed; they just have to say so
-- by listing anon/authenticated in allowed_roles.

select is_empty(
  $$
  select p.oid::regprocedure::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and p.proname not in (select function_name from private.restricted_rpc)
  $$,
  'every SECURITY DEFINER function in public is classified in the manifest'
);

-- ─── Actual privileges match the manifest exactly ────────────────────────────
--
-- Covers both directions: nothing extra is executable, and nothing the app relies on
-- has been revoked. Overloads are enumerated via pg_proc, so an added overload with
-- looser grants is caught too.

select is_empty(
  $$
  select format('%s / %s', p.oid::regprocedure, r.grantee)
  from private.restricted_rpc m
  join pg_proc p on p.proname = m.function_name
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  cross join (values ('anon'), ('authenticated'), ('service_role')) as r(grantee)
  where has_function_privilege(r.grantee, p.oid, 'EXECUTE') <> (r.grantee = any(m.allowed_roles))
  $$,
  'EXECUTE privileges on restricted RPCs match the manifest'
);

select ok(
  has_function_privilege('service_role', 'public.enqueue_job_match_recalc(uuid)', 'EXECUTE'),
  'service_role retains EXECUTE on enqueue_job_match_recalc'
);

-- ─── Denial is observable, not just implied by catalog state ─────────────────
--
-- lives_ok/throws_ok bodies must be literal SQL: psql :variables are not expanded
-- inside those strings under pg_prove.

set local role anon;

select throws_ok(
  $$select public.enqueue_job_match_recalc('00000000-0000-0000-0000-000000000099'::uuid)$$,
  '42501',
  null,
  'anon cannot call enqueue_job_match_recalc'
);

select throws_ok(
  $$select public.verify_user_password('irrelevant')$$,
  '42501',
  null,
  'anon cannot call verify_user_password'
);

reset role;
set local role authenticated;

select throws_ok(
  $$select public.enqueue_job_match_recalc('00000000-0000-0000-0000-000000000099'::uuid)$$,
  '42501',
  null,
  'authenticated cannot call enqueue_job_match_recalc'
);

reset role;

select * from finish();

rollback;
