-- RLS and RPC grant tests for job_skills and job_match_recalc_queue.
-- Run with: supabase test db
--
-- Role model (matches production):
--   * Fixtures: superuser (default pgTAP role)
--   * anon / authenticated / service_role: set local role before assertions
--
-- psql \set triple-quotes produce SQL string literals (see match_calculator.test.sql).
-- Requires full schema from supabase/migrations (CI: supabase test db applies all).

begin;

select plan(10);

\set test_job_id '''00000000-0000-0000-0000-000000000099'''
\set test_source_id '''00000000-0000-0000-0000-000000000098'''

-- ─── Fixtures (superuser bypasses RLS) ───────────────────────────────────────

reset role;

insert into public.sources (id, name, url)
values (:test_source_id, 'RLS Test Source', 'https://rls-test.example.com')
on conflict (id) do nothing;

insert into public.esco_skills (concept_uri, preferred_label_en)
values ('pgtap-skill-rls-test', 'RLS Test Skill')
on conflict (concept_uri) do nothing;

insert into public.jobs (id, source_id, job_title, organization, listing_url)
values (
  :test_job_id,
  :test_source_id,
  'RLS Test Job',
  'Test Org',
  'https://example.com/rls-test-job'
)
on conflict (id) do nothing;

insert into public.job_skills (job_id, skill_id, score, source)
values (:test_job_id, 'pgtap-skill-rls-test', 0.9, 'pgtap')
on conflict (job_id, skill_id) do nothing;

insert into public.job_match_recalc_queue (job_id)
values (:test_job_id)
on conflict (job_id) do nothing;

-- ─── anon: job_skills read, queue denied ─────────────────────────────────────

set local role anon;

select is(
  (select count(*)::int from public.job_skills where job_id = :test_job_id),
  1,
  'anon can read job_skills'
);

select throws_ok(
  $$select count(*) from public.job_match_recalc_queue$$,
  '42501',
  null,
  'anon cannot read job_match_recalc_queue (no table grant)'
);

-- ─── service_role: queue access with RLS enabled ─────────────────────────────

reset role;
set local role service_role;

select is(
  (select count(*)::int from public.job_match_recalc_queue where job_id = :test_job_id),
  1,
  'service_role can read job_match_recalc_queue with RLS enabled'
);

select ok(
  has_function_privilege('service_role', 'public.enqueue_job_match_recalc(uuid)', 'EXECUTE'),
  'service_role has EXECUTE on enqueue_job_match_recalc'
);

select lives_ok(
  'select public.enqueue_job_match_recalc(' || :test_job_id || ')',
  'service_role can call enqueue_job_match_recalc'
);

-- ─── SECURITY DEFINER enqueue still works (superuser / migration context) ────

reset role;

select lives_ok(
  'select public.enqueue_job_match_recalc(' || :test_job_id || ')',
  'enqueue_job_match_recalc works with queue RLS enabled (superuser)'
);

-- ─── RPC grants ──────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.bulk_update_skill_embeddings(jsonb)', 'EXECUTE'),
  'anon lacks EXECUTE on bulk_update_skill_embeddings'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);

select ok(
  not has_function_privilege('authenticated', 'public.bulk_update_skill_embeddings(jsonb)', 'EXECUTE'),
  'authenticated lacks EXECUTE on bulk_update_skill_embeddings'
);

select ok(
  has_function_privilege('authenticated', 'public.verify_user_password(text)', 'EXECUTE'),
  'authenticated has EXECUTE on verify_user_password'
);

reset role;
set local role service_role;

select ok(
  has_function_privilege('service_role', 'public.bulk_update_skill_embeddings(jsonb)', 'EXECUTE'),
  'service_role has EXECUTE on bulk_update_skill_embeddings'
);

select * from finish();

rollback;
