-- Security and Authentication tests
-- Run with: supabase test db

BEGIN;

SELECT plan(5);

-- ─── Setup Users ─────────────────────────────────────────────────────────────

\set user_a '''00000000-0000-0000-0000-00000000000a'''
\set user_b '''00000000-0000-0000-0000-00000000000b'''

-- Insert into auth.users (required for verify_user_password and RLS via auth.uid())
INSERT INTO auth.users (id, email, encrypted_password)
VALUES 
  (:user_a, 'user_a@example.com', extensions.crypt('password123', extensions.gen_salt('bf'))),
  (:user_b, 'user_b@example.com', extensions.crypt('secret456', extensions.gen_salt('bf')));

-- Insert into public.profiles
INSERT INTO public.profiles (id, skills)
VALUES 
  (:user_a, ARRAY['java']),
  (:user_b, ARRAY['python']);

-- ─── Test 1: RLS - User A can see their own profile ──────────────────────────

-- Impersonate User A
SELECT set_config('request.jwt.claims', format('{"sub": "%s"}', :user_a)::text, true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.profiles WHERE id = :user_a),
  1,
  'RLS: User A can select their own profile'
);

-- ─── Test 2: RLS - User A CANNOT see User B profile ──────────────────────────

SELECT is(
  (SELECT count(*)::int FROM public.profiles WHERE id = :user_b),
  0,
  'RLS: User A cannot select User B profile'
);

-- ─── Test 3: RLS - User A CANNOT see another user matches ────────────────────

RESET ROLE; -- Back to superuser to insert fixture
INSERT INTO public.job_matches (user_id, job_id, score)
VALUES (:user_b, '00000000-0000-0000-0000-00000000000c', 0.9);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', format('{"sub": "%s"}', :user_a)::text, true);

SELECT is(
  (SELECT count(*)::int FROM public.job_matches WHERE user_id = :user_b),
  0,
  'RLS: User A cannot select User B job matches'
);

-- ─── Test 4: verify_user_password (Success) ──────────────────────────────────

SELECT is(
  public.verify_user_password('password123'),
  'match',
  'verify_user_password: returns match for correct password'
);

-- ─── Test 5: verify_user_password (Failure) ──────────────────────────────────

SELECT is(
  public.verify_user_password('wrong_password'),
  'mismatch',
  'verify_user_password: returns mismatch for incorrect password'
);

SELECT * FROM finish();

ROLLBACK;
