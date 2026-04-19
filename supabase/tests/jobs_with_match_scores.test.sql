-- pgTAP tests for the jobs_with_match_scores View
-- Run with: supabase test db

BEGIN;

SELECT plan(7);

-- ─── Setup fixtures ─────────────────────────────────────────────────────────

\set user_a '''00000000-0000-0000-0000-aaaaaaaaaaaa'''
\set user_b '''00000000-0000-0000-0000-bbbbbbbbbbbb'''
\set job_1  '''00000000-0000-0000-0001-000000000001'''
\set job_2  '''00000000-0000-0000-0001-000000000002'''
\set src_1  '''00000000-0000-0000-0002-000000000001'''

-- Auth users (required for auth.uid() impersonation)
INSERT INTO auth.users (id, email, encrypted_password)
VALUES
(
    : user_a,
    'view_test_a@example.com',
    extensions.crypt('pw', extensions.gen_salt('bf'))
),
(
    : user_b,
    'view_test_b@example.com',
    extensions.crypt('pw', extensions.gen_salt('bf'))
);

-- Profiles (required by FK constraints if any)
INSERT INTO public.profiles (id) VALUES (: user_a), (: user_b);

-- Source
INSERT INTO public.sources (id, name, url)
VALUES (
    : src_1, 'Test Source', 'https://example.com'
);

-- Jobs
INSERT INTO public.jobs (
    id, job_title, organization, listing_url, source_id, work_type
)
VALUES
(
    : job_1, 'Developer', 'Acme Inc', 'https://acme.com/dev', : src_1, 'remote'
),
(
    : job_2, 'Designer', 'Acme Inc', 'https://acme.com/des', : src_1, 'hybrid'
);

-- Matches: User A has scores for job_1 only
INSERT INTO public.job_matches (
    user_id, job_id, score, value_score, skill_score
)
VALUES (: user_a, : job_1, 0.85, 0.7, 0.9);

-- ─── Test 1: View exists ────────────────────────────────────────────────────

SELECT
    has_view(
        'public', 'jobs_with_match_scores',
        'View jobs_with_match_scores should exist'
    );

-- ─── Test 2: View includes source_name column ──────────────────────────────

SELECT has_column(
    'public', 'jobs_with_match_scores', 'source_name',
    'View should include source_name from the sources join'
);

-- ─── Test 3: View includes match_score column ──────────────────────────────

SELECT has_column(
    'public', 'jobs_with_match_scores', 'match_score',
    'View should include match_score column'
);

-- ─── Test 4: Authenticated user sees their own match scores ────────────────

-- Impersonate User A
SELECT
    set_config(
        'request.jwt.claims', format('{"sub": "%s"}', : user_a)::TEXT, TRUE
    );
SET LOCAL ROLE authenticated;

SELECT is(
    (
        SELECT match_score::NUMERIC FROM public.jobs_with_match_scores
        WHERE id = : job_1
    ),
    0.85::NUMERIC,
    'User A sees their match score (0.85) for job_1'
);

-- ─── Test 5: Authenticated user sees 0 for unmatched jobs ──────────────────

SELECT is(
    (
        SELECT match_score::NUMERIC FROM public.jobs_with_match_scores
        WHERE id = : job_2
    ),
    0::NUMERIC,
    'User A sees match_score 0 for a job with no match row'
);

-- ─── Test 6: User B sees 0 for all jobs (no match rows) ───────────────────

RESET ROLE;
SELECT
    set_config(
        'request.jwt.claims', format('{"sub": "%s"}', : user_b)::TEXT, TRUE
    );
SET LOCAL ROLE authenticated;

SELECT is(
    (
        SELECT match_score::NUMERIC FROM public.jobs_with_match_scores
        WHERE id = : job_1
    ),
    0::NUMERIC,
    'User B sees match_score 0 for job_1 (only User A has a match)'
);

-- ─── Test 7: Source name is resolved from the sources table ────────────────

SELECT is(
    (
        SELECT source_name FROM public.jobs_with_match_scores
        WHERE id = : job_1
    ),
    'Test Source',
    'source_name is resolved from the joined sources table'
);

SELECT * FROM finish(); -- noqa: AM04

ROLLBACK;
