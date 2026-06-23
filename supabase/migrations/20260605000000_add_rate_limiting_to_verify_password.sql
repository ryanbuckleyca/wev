-- Migration: Add rate limiting to verify_user_password RPC
-- Description: Creates a request_logs table and updates the verify_user_password function
-- to prevent brute-force attacks with atomicity and DoS protection.

-- 1. Create request_logs table (tracks failed attempts only to prevent unbounded growth)
create table if not exists public.request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  created_at timestamptz not null default now()
);
-- Optimized composite index for rate limit checks
create index if not exists request_logs_user_event_created_idx
on public.request_logs (user_id, event_name, created_at);
-- RLS for request_logs: Only service_role can access it directly by default,
-- but we allow users to view their own logs for transparency and testing.
alter table public.request_logs enable row level security;
create policy "Users can view their own request logs"
  on public.request_logs for select
  using (auth.uid() = user_id);
-- 2. Maintenance: Scheduled purge for old logs (retention: 7 days)
-- We use pg_cron if available, otherwise logs are pruned during verification failures.
create extension if not exists pg_cron with schema extensions;
-- Create a purge function that can be called manually or by cron
create or replace function public.purge_request_logs()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.request_logs
  where created_at < now() - interval '7 days';
end;
$$;
-- Schedule the purge to run daily at midnight
select cron.schedule(
  'purge-request-logs',
  '0 0 * * *',
  'select public.purge_request_logs()'
);
-- 3. Update verify_user_password RPC
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
  v_result text;
begin
  -- Get current user ID
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- 1. Atomicity: Use advisory lock to prevent race conditions for this user
  -- We use a transaction-level lock on the 64-bit hash of the user ID
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- 2. Rate limiting check: max 5 FAILED requests per minute
  -- We only count failed attempts towards the limit to prevent an attacker
  -- from locking out a user with the correct password. However, once the
  -- failure threshold is hit, ALL subsequent attempts (including correct
  -- passwords) are blocked for the remainder of the minute to stop brute-force.
  select count(*) into request_count
  from public.request_logs
  where user_id = v_user_id
    and event_name = 'verify_password'
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
      v_result := 'match';
    else
      v_result := 'mismatch';
    end if;
  end if;

  -- 5. Log ONLY failed attempts to prevent unbounded table growth
  if v_result = 'mismatch' then
    -- Prune logs older than 7 days for this user to keep the table clean
    -- even if the global scheduled purge isn't running.
    delete from public.request_logs
    where user_id = v_user_id
      and created_at < now() - interval '7 days';

    insert into public.request_logs (user_id, event_name)
    values (v_user_id, 'verify_password');
  end if;

  return v_result;
end;
$$;
-- Ensure only authenticated users can call this
revoke all on function public.verify_user_password(text) from public;
grant execute on function public.verify_user_password(text) to authenticated;
comment on function public.verify_user_password(text) is 'Verifies a user password with atomic rate limiting (max 5 failures/min) and failed request logging.';
