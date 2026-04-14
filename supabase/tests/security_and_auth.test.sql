-- Security and Authentication tests
-- Run with: supabase test db

begin;

select plan(5);

-- ─── Setup Users ─────────────────────────────────────────────────────────────

\set user_a '''00000000-0000-0000-0000-00000000000a'''
\set user_b '''00000000-0000-0000-0000-00000000000b'''

-- Insert into auth.users (required for verify_user_password and RLS via auth.uid())
insert into auth.users (id, email, encrypted_password)
values 
  (:user_a, 'user_a@example.com', extensions.crypt('password123', extensions.gen_salt('bf'))),
  (:user_b, 'user_b@example.com', extensions.crypt('secret456', extensions.gen_salt('bf')));

-- Insert into public.profiles
insert into public.profiles (id, skills)
values 
  (:user_a, array['java']),
  (:user_b, array['python']);

-- ─── Test 1: RLS - User A can see their own profile ──────────────────────────

-- Impersonate User A
select set_config('request.jwt.claims', format('{"sub": "%s"}', :user_a)::text, true);
set local role authenticated;

select is(
  (select count(*)::int from public.profiles where id = :user_a),
  1,
  'RLS: User A can select their own profile'
);

-- ─── Test 2: RLS - User A CANNOT see User B profile ──────────────────────────

select is(
  (select count(*)::int from public.profiles where id = :user_b),
  0,
  'RLS: User A cannot select User B profile'
);

-- ─── Test 3: RLS - User A CANNOT see another user matches ────────────────────

reset role; -- Back to superuser to insert fixture
insert into public.job_matches (user_id, job_id, score)
values (:user_b, '00000000-0000-0000-0000-00000000000c', 0.9);

set local role authenticated;
select set_config('request.jwt.claims', format('{"sub": "%s"}', :user_a)::text, true);

select is(
  (select count(*)::int from public.job_matches where user_id = :user_b),
  0,
  'RLS: User A cannot select User B job matches'
);

-- ─── Test 4: verify_user_password (Success) ──────────────────────────────────

select is(
  public.verify_user_password('password123'),
  'match',
  'verify_user_password: returns match for correct password'
);

-- ─── Test 5: verify_user_password (Failure) ──────────────────────────────────

select is(
  public.verify_user_password('wrong_password'),
  'mismatch',
  'verify_user_password: returns mismatch for incorrect password'
);

select * from finish();

rollback;
