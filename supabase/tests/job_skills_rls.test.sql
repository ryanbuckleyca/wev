-- RLS tests for public.job_skills (public read) and public.job_match_recalc_queue
-- (internal, no client access).
-- Run with: supabase test db
--
-- Role model matches production:
--   * Fixtures run as the default pgTAP role (postgres), which bypasses RLS.
--   * anon / authenticated / service_role are entered with `set local role`.
--
-- UUIDs are written inline rather than via psql \set: the triple-quote escaping needed
-- to make \set produce a SQL literal does not survive into lives_ok/throws_ok bodies,
-- which are parsed as literal SQL by pg_prove.
--
-- EXECUTE grants on internal RPCs are asserted in restricted_rpc_grants.test.sql.

begin;

select plan(10);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

reset role;

insert into public.sources (id, name, url)
values (
  '00000000-0000-0000-0000-000000000098',
  'RLS Test Source',
  'https://rls-test.example.com'
)
on conflict (id) do nothing;

insert into public.esco_skills (concept_uri, preferred_label_en)
values ('pgtap-skill-rls-test', 'RLS Test Skill')
on conflict (concept_uri) do nothing;

insert into public.jobs (id, source_id, job_title, organization, listing_url)
values (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000098',
  'RLS Test Job',
  'Test Org',
  'https://example.com/rls-test-job'
)
on conflict (id) do nothing;

insert into public.job_skills (job_id, skill_id, score, source)
values ('00000000-0000-0000-0000-000000000099', 'pgtap-skill-rls-test', 0.9, 'pgtap')
on conflict (job_id, skill_id) do nothing;

insert into public.job_match_recalc_queue (job_id)
values ('00000000-0000-0000-0000-000000000099')
on conflict (job_id) do nothing;

-- ─── Policy / RLS configuration ──────────────────────────────────────────────

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'job_match_recalc_queue'
  ),
  'RLS is enabled on job_match_recalc_queue'
);

select isnt_empty(
  $$
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'job_match_recalc_queue'
    and cmd = 'ALL'
    and roles @> '{anon,authenticated}'::name[]
    and qual = 'false'
  $$,
  'job_match_recalc_queue has a deny-all policy for anon and authenticated'
);

select isnt_empty(
  $$
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'job_skills'
    and cmd = 'SELECT'
  $$,
  'job_skills has a SELECT policy'
);

-- ─── job_skills is publicly readable ─────────────────────────────────────────

set local role anon;

select is(
  (
    select count(*)::int
    from public.job_skills
    where job_id = '00000000-0000-0000-0000-000000000099'
  ),
  1,
  'anon can read job_skills'
);

reset role;
set local role authenticated;

select is(
  (
    select count(*)::int
    from public.job_skills
    where job_id = '00000000-0000-0000-0000-000000000099'
  ),
  1,
  'authenticated can read job_skills'
);

-- ─── The queue is not reachable by client roles ──────────────────────────────
--
-- These fail at the table grant (42501) before RLS is consulted. Asserting the error
-- code keeps the test honest: a bare count(*) returning 0 would also "pass" if the
-- table were readable but empty.

reset role;
set local role anon;

select throws_ok(
  $$select count(*) from public.job_match_recalc_queue$$,
  '42501',
  null,
  'anon cannot read job_match_recalc_queue'
);

reset role;
set local role authenticated;

select throws_ok(
  $$select count(*) from public.job_match_recalc_queue$$,
  '42501',
  null,
  'authenticated cannot read job_match_recalc_queue'
);

select throws_ok(
  $$insert into public.job_match_recalc_queue (job_id)
    values ('00000000-0000-0000-0000-000000000097'::uuid)$$,
  '42501',
  null,
  'authenticated cannot write to job_match_recalc_queue'
);

-- ─── service_role and SECURITY DEFINER paths still work ──────────────────────

reset role;
set local role service_role;

select is(
  (
    select count(*)::int
    from public.job_match_recalc_queue
    where job_id = '00000000-0000-0000-0000-000000000099'
  ),
  1,
  'service_role can read job_match_recalc_queue with RLS enabled'
);

select lives_ok(
  $$select public.enqueue_job_match_recalc('00000000-0000-0000-0000-000000000099'::uuid)$$,
  'service_role can call enqueue_job_match_recalc with RLS enabled'
);

reset role;

select * from finish();

rollback;
