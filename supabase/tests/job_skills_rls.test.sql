-- RLS tests for job_skills and job_match_recalc_queue
-- Run with: supabase test db

begin;

select plan(3);

\set test_job_id '''00000000-0000-0000-0000-000000000099'''
\set test_source_id '''00000000-0000-0000-0000-000000000098'''
\set test_skill_uri '''pgtap-skill-rls-test'''

insert into public.sources (id, name, url)
values (:test_source_id, 'RLS Test Source', 'https://rls-test.example.com')
on conflict (id) do nothing;

insert into public.esco_skills (concept_uri, preferred_label_en)
values (:test_skill_uri, 'RLS Test Skill')
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
values (:test_job_id, :test_skill_uri, 0.9, 'pgtap')
on conflict (job_id, skill_id) do nothing;

-- anon can read job_skills
set local role anon;

select is(
  (select count(*)::int from public.job_skills where job_id = :test_job_id),
  1,
  'RLS: anon can read job_skills'
);

-- anon cannot read the internal recalc queue (no table grant)
select throws_ok(
  $$select count(*) from public.job_match_recalc_queue$$,
  '42501',
  null,
  'anon cannot read job_match_recalc_queue'
);

-- authenticated cannot execute bulk_update_skill_embeddings
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);

select throws_ok(
  $$select public.bulk_update_skill_embeddings('[]'::jsonb)$$,
  '42501',
  null,
  'RLS: authenticated cannot execute bulk_update_skill_embeddings'
);

select * from finish();

rollback;
