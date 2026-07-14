-- Tests for public.get_auth_user_id_by_email
-- Run with: supabase test db

begin;

select plan(4);

\set user_a '''00000000-0000-0000-0000-0000000000a1'''

insert into auth.users (id, email, encrypted_password)
values (:user_a, 'Existing.User@Example.com', extensions.crypt('password123', extensions.gen_salt('bf')));

-- ─── Test 1: returns the id for an existing email ────────────────────────────

select is(
  public.get_auth_user_id_by_email('Existing.User@Example.com'),
  :user_a::uuid,
  'returns the auth user id for an existing email'
);

-- ─── Test 2: match is case-insensitive ───────────────────────────────────────

select is(
  public.get_auth_user_id_by_email('existing.user@example.com'),
  :user_a::uuid,
  'matches email case-insensitively'
);

-- ─── Test 3: returns null for an unknown email ───────────────────────────────

select is(
  public.get_auth_user_id_by_email('nobody@example.com'),
  null,
  'returns null for an unknown email'
);

-- ─── Test 4: not callable by anon/authenticated (service_role only) ───────────

set local role authenticated;

select throws_ok(
  $$ select public.get_auth_user_id_by_email('existing.user@example.com') $$,
  '42501',
  null,
  'authenticated role cannot execute get_auth_user_id_by_email'
);

reset role;

select * from finish();

rollback;
