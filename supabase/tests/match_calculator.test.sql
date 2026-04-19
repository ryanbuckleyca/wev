-- pgTAP tests for recalculate_matches_for_user RPC
-- Run with: supabase test db

BEGIN;

SELECT plan(9);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

\set test_user_id  '''00000000-0000-0000-0000-000000000001'''
\set test_job_id   '''00000000-0000-0000-0000-000000000002'''
\set test_source_id '''00000000-0000-0000-0000-000000000003'''

-- Source
INSERT INTO public.sources (id, name, url)
VALUES (:test_source_id, 'pgTAP Test Source', 'https://pgtap-test.example.com')
ON CONFLICT (id) DO NOTHING;

-- ESCO skills (1024-dim vectors: exact, and two semantically similar ones)
INSERT INTO public.esco_skills (concept_uri, preferred_label_en, embedding)
VALUES
  ('pgtap-skill-exact',      'Exact Skill',  NULL),
  ('pgtap-skill-semantic-1', 'Management',   (SELECT array_fill(0::float, ARRAY[1024])::vector)),
  ('pgtap-skill-semantic-2', 'Leadership',   (SELECT array_fill(0::float, ARRAY[1024])::vector))
ON CONFLICT (concept_uri) DO NOTHING;

-- Job: remote, Ottawa, values=[community,care], skills=[exact, semantic-2]
INSERT INTO public.jobs (
  id, source_id, job_title, organization, listing_url,
  skills, values, work_type, lat, lng, municipality, province
) VALUES (
  :test_job_id, :test_source_id, 'pgTAP Test Job', 'Test Org',
  'https://example.com/pgtap-job',
  ARRAY['pgtap-skill-exact', 'pgtap-skill-semantic-2'],
  ARRAY['community', 'care'],
  'remote', 45.4215, -75.6972, 'Ottawa', 'ON'
) ON CONFLICT (id) DO NOTHING;

-- ─── Test 1: exact match produces a high score ───────────────────────────────

INSERT INTO public.profiles (id, skills, values, work_types, lat, lng, municipality, province)
VALUES (
  :test_user_id,
  ARRAY['pgtap-skill-exact'],
  ARRAY['community', 'care'],
  ARRAY['remote'],
  45.4247, -75.6950, 'Ottawa', 'ON'
) ON CONFLICT (id) DO NOTHING;

SELECT recalculate_matches_for_user(:test_user_id);

SELECT ok(
  (SELECT score FROM public.job_matches
   WHERE user_id = :test_user_id AND job_id = :test_job_id) > 0.7,
  'exact match: score > 0.7'
);

SELECT ok(
  (SELECT 'community' = ANY(shared_values) FROM public.job_matches
   WHERE user_id = :test_user_id AND job_id = :test_job_id),
  'exact match: shared_values contains community'
);

SELECT ok(
  (SELECT location_score = 1.0 FROM public.job_matches
   WHERE user_id = :test_user_id AND job_id = :test_job_id),
  'exact match: Ottawa-to-Ottawa location_score = 1.0'
);

-- ─── Test 2: value mismatch drops score ──────────────────────────────────────

UPDATE public.profiles
SET values = ARRAY['growth']  -- no overlap with job values
WHERE id = :test_user_id;

SELECT recalculate_matches_for_user(:test_user_id);

SELECT ok(
  (SELECT score FROM public.job_matches
   WHERE user_id = :test_user_id AND job_id = :test_job_id) < 0.5,
  'value mismatch: score < 0.5'
);

SELECT ok(
  (SELECT value_score = 0 FROM public.job_matches
   WHERE user_id = :test_user_id AND job_id = :test_job_id),
  'value mismatch: value_score = 0'
);

-- ─── Test 3: remote job + onsite user → location_score is NULL ───────────────

UPDATE public.profiles
SET work_types = ARRAY['onsite'], lat = 49.2827, lng = -123.1207,
    municipality = 'Vancouver', province = 'BC'
WHERE id = :test_user_id;

SELECT recalculate_matches_for_user(:test_user_id);

SELECT ok(
  (SELECT location_score IS NULL FROM public.job_matches
   WHERE user_id = :test_user_id AND job_id = :test_job_id),
  'remote job + onsite user: location_score is NULL'
);

-- ─── Test 4: semantic similarity produces a score ──────────────────────────────
-- User has Management, Job has Leadership. They share 1.0 similarity in fixtures.

UPDATE public.profiles
SET skills = ARRAY['pgtap-skill-semantic-1']
WHERE id = :test_user_id;

SELECT recalculate_matches_for_user(:test_user_id);

SELECT ok(
  (SELECT skill_score > 0.5 FROM public.job_matches
   WHERE user_id = :test_user_id AND job_id = :test_job_id),
  'semantic match: skill_score > 0.5 (Management vs Leadership)'
);

-- ─── Test 5: trigger automatically recalculates matches ──────────────────────
-- We update the profile and check matches WITHOUT calling the RPC manually.

UPDATE public.profiles
SET skills = ARRAY['pgtap-skill-exact']
WHERE id = :test_user_id;

SELECT ok(
  (SELECT skill_score = 1.0 FROM public.job_matches
   WHERE user_id = :test_user_id AND job_id = :test_job_id),
  'trigger: profile update automatically updates job_matches skill_score'
);

-- ─── Test 6: job-initiated matching ──────────────────────────────────────────
-- When a new job is added or updated, recalculate_matches_for_job should work.

\set test_job_id_2 '''00000000-0000-0000-0000-000000000004'''

INSERT INTO public.jobs (
  id, source_id, job_title, organization, listing_url,
  skills, values, work_type, lat, lng, municipality, province
) VALUES (
  :test_job_id_2, :test_source_id, 'pgTAP Test Job 2', 'Test Org',
  'https://example.com/pgtap-job-2',
  ARRAY['pgtap-skill-exact'],
  ARRAY['community'],
  'remote', 45.4215, -75.6972, 'Ottawa', 'ON'
) ON CONFLICT (id) DO NOTHING;

SELECT recalculate_matches_for_job(:test_job_id_2);

SELECT ok(
  EXISTS(SELECT 1 FROM public.job_matches WHERE user_id = :test_user_id AND job_id = :test_job_id_2),
  'job-initiated: recalculate_matches_for_job creates match for existing user'
);

-- ─── Cleanup ─────────────────────────────────────────────────────────────────

DELETE FROM public.job_matches WHERE user_id = :test_user_id;
DELETE FROM public.profiles    WHERE id = :test_user_id;
DELETE FROM public.jobs        where id = :test_job_id;
DELETE FROM public.sources     WHERE id = :test_source_id;
DELETE FROM public.esco_skills WHERE concept_uri LIKE 'pgtap-%';

SELECT * FROM finish();

ROLLBACK;
