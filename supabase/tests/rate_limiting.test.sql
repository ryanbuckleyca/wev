-- Rate Limiting tests for verify_user_password
-- Run with: supabase test db

begin;

select plan(5);

-- ─── Setup User ─────────────────────────────────────────────────────────────

\set test_user '''00000000-0000-0000-0000-00000000000f'''
insert into auth.users (id, email, encrypted_password)
values (:test_user, 'rate_limit@example.com', extensions.crypt('password123', extensions.gen_salt('bf')));

-- Impersonate User
select set_config('request.jwt.claims', format('{"sub": "%s"}', :test_user)::text, true);
set local role authenticated;

-- ─── Test 1: Successful attempts do NOT trigger rate limiting ───────────────

-- Call verify_user_password 10 times with CORRECT password
-- This should NOT trigger the rate limit because we only limit failures now.
select is(
  (select count(*) from (select public.verify_user_password('password123') from generate_series(1, 10)) s)::int,
  10,
  '10 successful requests should all pass'
);

-- ─── Test 2: Failed attempts trigger rate limiting ──────────────────────────

-- Call verify_user_password 5 times with WRONG password
select is(
  (select count(*) from (select public.verify_user_password('wrong_pass') from generate_series(1, 5)) s)::int,
  5,
  '5 failed requests should be allowed initially'
);

-- The 6th failed call should fail with the custom error code 42900
select throws_ok(
  'select public.verify_user_password(''wrong_pass'')',
  '42900',
  'Too many failed attempts. Please try again in a minute.',
  '6th failed request should be blocked'
);

-- ─── Test 3: Correct password is also blocked after failure limit is hit ────

-- This is important for security: once the failure limit is hit, 
-- even the correct password must be blocked to prevent brute-force success.
select throws_ok(
  'select public.verify_user_password(''password123'')',
  '42900',
  'Too many failed attempts. Please try again in a minute.',
  'Correct password should also be blocked after failure limit hit'
);

-- ─── Test 4: Logs are recorded correctly ─────────────────────────────────────

select is(
  (select count(*)::int from public.request_logs where user_id = :test_user),
  5,
  'Should have exactly 5 logs (failures only)'
);

select * from finish();

rollback;
