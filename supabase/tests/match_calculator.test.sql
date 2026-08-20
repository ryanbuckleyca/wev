-- pgTAP tests for recalculate_matches_for_user RPC
-- Run with: supabase test db

begin;

select plan(13);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

\set test_user_id  '''00000000-0000-0000-0000-000000000001'''
\set test_job_id   '''00000000-0000-0000-0000-000000000002'''
\set test_source_id '''00000000-0000-0000-0000-000000000003'''

-- Source
insert into public.sources (id, name, url)
values (:test_source_id, 'pgTAP Test Source', 'https://pgtap-test.example.com')
on conflict (id) do nothing;

-- ESCO skills (1024-dim vectors: exact, and two semantically similar ones)
insert into public.esco_skills (concept_uri, preferred_label_en, embedding)
values
  ('pgtap-skill-exact',      'Exact Skill',  null),
  ('pgtap-skill-semantic-1', 'Management',   (select array_fill(0::float, array[1024])::vector)),
  ('pgtap-skill-semantic-2', 'Leadership',   (select array_fill(0::float, array[1024])::vector))
on conflict (concept_uri) do nothing;

-- Job: remote, Ottawa, values=[community,care], skills=[exact, semantic-2]
insert into public.jobs (
  id, source_id, job_title, organization, listing_url,
  skills, values, work_type, lat, lng, municipality, province
) values (
  :test_job_id, :test_source_id, 'pgTAP Test Job', 'Test Org',
  'https://example.com/pgtap-job',
  array['pgtap-skill-exact', 'pgtap-skill-semantic-2'],
  array['community', 'care'],
  'remote', 45.4215, -75.6972, 'Ottawa', 'ON'
) on conflict (id) do nothing;

-- ─── Test 1: exact match produces a high score ───────────────────────────────

insert into public.profiles (id, skills, values, work_types, lat, lng, municipality, province)
values (
  :test_user_id,
  array['pgtap-skill-exact'],
  array['community', 'care'],
  array['remote'],
  45.4247, -75.6950, 'Ottawa', 'ON'
) on conflict (id) do nothing;

select recalculate_matches_for_user(:test_user_id);

select ok(
  (select score from public.job_matches
   where user_id = :test_user_id and job_id = :test_job_id) > 0.7,
  'exact match: score > 0.7'
);

select ok(
  (select 'community' = any(shared_values) from public.job_matches
   where user_id = :test_user_id and job_id = :test_job_id),
  'exact match: shared_values contains community'
);

select ok(
  (select location_score = 1.0 from public.job_matches
   where user_id = :test_user_id and job_id = :test_job_id),
  'exact match: Ottawa-to-Ottawa location_score = 1.0'
);

-- ─── Test 2: value mismatch drops score ──────────────────────────────────────

update public.profiles
set values = array['growth']  -- no overlap with job values
where id = :test_user_id;

select recalculate_matches_for_user(:test_user_id);

select ok(
  (select score from public.job_matches
   where user_id = :test_user_id and job_id = :test_job_id) < 0.5,
  'value mismatch: score < 0.5'
);

select ok(
  (select value_score = 0 from public.job_matches
   where user_id = :test_user_id and job_id = :test_job_id),
  'value mismatch: value_score = 0'
);

-- ─── Test 3: remote job + onsite user → location_score is NULL ───────────────

update public.profiles
set work_types = array['onsite'], lat = 49.2827, lng = -123.1207,
    municipality = 'Vancouver', province = 'BC'
where id = :test_user_id;

select recalculate_matches_for_user(:test_user_id);

select ok(
  (select location_score is null from public.job_matches
   where user_id = :test_user_id and job_id = :test_job_id),
  'remote job + onsite user: location_score is NULL'
);

-- ─── Test 4: semantic similarity produces a score ──────────────────────────────
-- User has Management, Job has Leadership. They share 1.0 similarity in fixtures.

update public.profiles
set skills = array['pgtap-skill-semantic-1']
where id = :test_user_id;

select recalculate_matches_for_user(:test_user_id);

select ok(
  (select skill_score > 0.5 from public.job_matches
   where user_id = :test_user_id and job_id = :test_job_id),
  'semantic match: skill_score > 0.5 (Management vs Leadership)'
);

-- ─── Test 5: trigger automatically recalculates matches ──────────────────────
-- We update the profile and check matches WITHOUT calling the RPC manually.

update public.profiles
set skills = array['pgtap-skill-exact']
where id = :test_user_id;

select ok(
  (select skill_score = 1.0 from public.job_matches
   where user_id = :test_user_id and job_id = :test_job_id),
  'trigger: profile update automatically updates job_matches skill_score'
);

-- ─── Test 6: job-initiated matching via async queue worker ────────────────────
-- Previously this test relied on a synchronous jobs trigger; the canonical
-- path is now enqueue_job_match_recalc() + process_job_match_recalc_queue().
-- This test also verifies the trigger has been narrowed: a pure summary-only
-- UPDATE must NOT enqueue match recalculation.

\set test_job_id_2 '''00000000-0000-0000-0000-000000000004'''

insert into public.jobs (
  id, source_id, job_title, organization, listing_url,
  skills, values, work_type, lat, lng, municipality, province
) values (
  :test_job_id_2, :test_source_id, 'pgTAP Test Job 2', 'Test Org',
  'https://example.com/pgtap-job-2',
  array['pgtap-skill-exact'],
  array['community'],
  'remote', 45.4215, -75.6972, 'Ottawa', 'ON'
) on conflict (id) do nothing;

-- Confirm INSERT enqueues because the row has match-relevant data.
select ok(
  exists(
    select 1 from public.job_match_recalc_queue
     where job_id = :test_job_id_2 and processed_at is null
  ),
  'async job recalc: INSERT of qualified job enqueues recalc'
);

-- Drain the queue manually (pg_cron schedules are not active inside tests).
select ok(
  (select processed_jobs >= 0 from public.process_job_match_recalc_queue(
    p_batch_size => 25, p_claim_owner => 'pgtap'
  )),
  'async job recalc: process_job_match_recalc_queue runs without error'
);

select ok(
  exists(select 1 from public.job_matches where user_id = :test_user_id and job_id = :test_job_id_2),
  'async job recalc: worker creates match for existing user'
);

-- Narrow-trigger check: UPDATE only summary/description (not in the watchlist)
-- and confirm no new queue row appeared for test_job_id.
update public.jobs
set summary = 'summary-only update should not trigger match recalc',
    description = 'description-only update'
where id = :test_job_id;

select ok(
  not exists(
    select 1 from public.job_match_recalc_queue
     where job_id = :test_job_id and enqueued_at > now() - interval '10s'
  ),
  'async job recalc: summary/description UPDATE does not enqueue recalc'
);

-- ─── Cleanup ─────────────────────────────────────────────────────────────────

delete from public.job_match_recalc_queue where job_id in (:test_job_id, :test_job_id_2);
delete from public.job_matches where user_id = :test_user_id;
delete from public.profiles    where id = :test_user_id;
delete from public.jobs        where id in (:test_job_id, :test_job_id_2);
delete from public.sources     where id = :test_source_id;
delete from public.esco_skills where concept_uri like 'pgtap-%';

select * from finish();

rollback;
