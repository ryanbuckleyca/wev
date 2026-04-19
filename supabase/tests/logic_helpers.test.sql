-- Unit tests for various SQL logic helpers
-- Run with: supabase test db

BEGIN;

SELECT plan(6);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public.esco_skills (concept_uri, preferred_label_en, embedding)
VALUES ('pgtap-skill-vector-test', 'Vector Test Skill', (SELECT array_fill(1.0::float, ARRAY[1024])::vector))
ON CONFLICT (concept_uri) DO NOTHING;

-- ─── Test 1: location_score_for_pair (Exact City Match) ───────────────────────

SELECT is(
  location_score_for_pair(
    'Ottawa', 'ON', 45.4215, -75.6972, ARRAY['remote', 'hybrid', 'onsite'],
    'Ottawa', 'ON', 45.4215, -75.6972, 'rooftop', 'onsite'
  ),
  1.0::float8,
  'location_score: exact municipality and province match = 1.0'
);

-- ─── Test 2: location_score_for_pair (Remote Job) ────────────────────────────

SELECT is(
  location_score_for_pair(
    'Vancouver', 'BC', 49.2827, -123.1207, ARRAY['onsite'],
    'Ottawa', 'ON', 45.4215, -75.6972, 'rooftop', 'remote'
  ),
  NULL::float8,
  'location_score: remote job for onsite-only user = NULL'
);

-- ─── Test 3: annualize_v1 (Hourly) ───────────────────────────────────────────

SELECT is(
  public.annualize_v1(2500::bigint, 'HOUR', 40),
  5200000::bigint,
  'annualize_v1: 2500 cents/hr @ 40hrs = 5,200,000 cents ($52k)'
);

-- ─── Test 4: annualize_v1 (Monthly) ──────────────────────────────────────────

SELECT is(
  public.annualize_v1(500000::bigint, 'MONTH'),
  6000000::bigint,
  'annualize_v1: 500,000 cents/mo = 6,000,000 cents ($60k)'
);

-- ─── Test 5: annualize_v1 (Already Annual) ───────────────────────────────────

SELECT is(
  public.annualize_v1(12000000::bigint, 'YEAR'),
  12000000::bigint,
  'annualize_v1: yearly remains unchanged'
);

-- ─── Test 6: match_skills_by_embedding (Vector Similarity) ────────────────────

-- Verify that match_skills_by_embedding returns the target skill when given its exact embedding
SELECT is(
  (SELECT concept_uri FROM public.match_skills_by_embedding(
    (SELECT array_fill(1.0::float, ARRAY[1024])::vector),
    1
  )),
  'pgtap-skill-vector-test',
  'match_skills_by_embedding: returns correct skill for exact vector match'
);

SELECT * FROM finish();

ROLLBACK;
