-- pgTAP tests for the jobs_with_match_scores View
-- Run with: supabase test db

begin;

select plan(7);

-- ─── Setup fixtures ─────────────────────────────────────────────────────────

\set user_a '''00000000-0000-0000-0000-aaaaaaaaaaaa'''
\set user_b '''00000000-0000-0000-0000-bbbbbbbbbbbb'''
\set job_1  '''00000000-0000-0000-0001-000000000001'''
\set job_2  '''00000000-0000-0000-0001-000000000002'''
\set src_1  '''00000000-0000-0000-0002-000000000001'''

-- Auth users (required for auth.uid() impersonation)
insert into auth.users (id, email, encrypted_password)
values
  (:user_a, 'view_test_a@example.com', extensions.crypt('pw', extensions.gen_salt('bf'))),
  (:user_b, 'view_test_b@example.com', extensions.crypt('pw', extensions.gen_salt('bf')));

-- Profiles (required by FK constraints if any)
insert into public.profiles (id) values (:user_a), (:user_b);

-- Source
insert into public.sources (id, name, url) values (:src_1, 'Test Source', 'https://example.com');

-- Jobs
insert into public.jobs (id, job_title, organization, listing_url, source_id, work_type)
values
  (:job_1, 'Developer', 'Acme Inc', 'https://acme.com/dev', :src_1, 'remote'),
  (:job_2, 'Designer',  'Acme Inc', 'https://acme.com/des', :src_1, 'hybrid');

-- Matches: User A has scores for job_1 only
insert into public.job_matches (user_id, job_id, score, value_score, skill_score)
values (:user_a, :job_1, 0.85, 0.7, 0.9);

-- ─── Test 1: View exists ────────────────────────────────────────────────────

select has_view('public', 'jobs_with_match_scores', 'View jobs_with_match_scores should exist');

-- ─── Test 2: View includes source_name column ──────────────────────────────

select has_column('public', 'jobs_with_match_scores', 'source_name',
  'View should include source_name from the sources join');

-- ─── Test 3: View includes match_score column ──────────────────────────────

select has_column('public', 'jobs_with_match_scores', 'match_score',
  'View should include match_score column');

-- ─── Test 4: Authenticated user sees their own match scores ────────────────

-- Impersonate User A
select set_config('request.jwt.claims', format('{"sub": "%s"}', :user_a)::text, true);
set local role authenticated;

select is(
  (select match_score::numeric from public.jobs_with_match_scores where id = :job_1),
  0.85::numeric,
  'User A sees their match score (0.85) for job_1'
);

-- ─── Test 5: Authenticated user sees 0 for unmatched jobs ──────────────────

select is(
  (select match_score::numeric from public.jobs_with_match_scores where id = :job_2),
  0::numeric,
  'User A sees match_score 0 for a job with no match row'
);

-- ─── Test 6: User B sees 0 for all jobs (no match rows) ───────────────────

reset role;
select set_config('request.jwt.claims', format('{"sub": "%s"}', :user_b)::text, true);
set local role authenticated;

select is(
  (select match_score::numeric from public.jobs_with_match_scores where id = :job_1),
  0::numeric,
  'User B sees match_score 0 for job_1 (only User A has a match)'
);

-- ─── Test 7: Source name is resolved from the sources table ────────────────

select is(
  (select source_name from public.jobs_with_match_scores where id = :job_1),
  'Test Source',
  'source_name is resolved from the joined sources table'
);

select * from finish();

rollback;
