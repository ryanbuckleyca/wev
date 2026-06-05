-- Migration: Add rate limiting to verify_user_password RPC
-- Description: Creates a request_logs table and updates the verify_user_password function
-- to prevent brute-force attacks with atomicity and DoS protection.

-- 1. Create request_logs table
create table if not exists public.request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  is_success boolean not null default false,
  created_at timestamptz not null default now()
);

-- Optimized composite index for rate limit checks
create index if not exists request_logs_user_event_success_created_idx
on public.request_logs (user_id, event_name, is_success, created_at);

-- RLS for request_logs: Only service_role can access it directly by default,
-- but we allow users to view their own logs for transparency and testing.
alter table public.request_logs enable row level security;

create policy "Users can view their own request logs"
  on public.request_logs for select
  using (auth.uid() = user_id);

-- 2. Update verify_user_password RPC
create or replace function public.verify_user_password(password text)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  stored_password text;
  request_count int;
  v_user_id uuid;
  v_is_match boolean := false;
  v_result text;
begin
  -- Get current user ID
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- 1. Atomicity: Use advisory lock to prevent race conditions for this user
  -- We use a transaction-level lock on the hash of the user ID
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- 2. Rate limiting check: max 5 FAILED requests per minute
  -- This prevents DoS attacks where an attacker locks out a user with wrong passwords,
  -- while still stopping brute-force attempts.
  select count(*) into request_count
  from public.request_logs
  where user_id = v_user_id
    and event_name = 'verify_password'
    and is_success = false
    and created_at > now() - interval '1 minute';

  if request_count >= 5 then
    raise exception 'Too many failed attempts. Please try again in a minute.' using errcode = '42900';
  end if;

  -- 3. Get the encrypted password
  select u.encrypted_password into stored_password
  from auth.users u
  where u.id = v_user_id;

  if stored_password is null then
    v_result := 'no_password';
  else
    -- 4. Verify password
    if stored_password = crypt(password::text, stored_password) then
      v_is_match := true;
      v_result := 'match';
    else
      v_result := 'mismatch';
    end if;
  end if;

  -- 5. Log the attempt with success/failure status
  insert into public.request_logs (user_id, event_name, is_success)
  values (v_user_id, 'verify_password', v_is_match);

  return v_result;
end;
$$;

-- Ensure only authenticated users can call this
revoke all on function public.verify_user_password(text) from public;
grant execute on function public.verify_user_password(text) to authenticated;

comment on function public.verify_user_password(text) is 'Verifies a user password with atomic rate limiting (max 5 failures/min) and success tracking.';
