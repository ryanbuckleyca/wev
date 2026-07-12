-- Migration: Add get_auth_user_id_by_email RPC
-- Description: SECURITY DEFINER lookup that returns the auth.users id for a given
-- email (case-insensitive), or null. Used server-side (service role only) by the
-- signup API to decide whether an attempt belongs to an existing account so it can
-- send a magic link instead of failing silently. Locked down to service_role so it
-- can never become an account-existence oracle for anon/authenticated clients.

create or replace function public.get_auth_user_id_by_email(input_email text)
returns uuid
language plpgsql
security definer
set search_path = auth
as $$
declare
  v_user_id uuid;
begin
  if input_email is null or length(trim(input_email)) = 0 then
    return null;
  end if;

  select id
  into v_user_id
  from auth.users
  where lower(email) = lower(trim(input_email))
  limit 1;

  return v_user_id;
end;
$$;

-- Never expose to clients: only the server-side service role may call this.
revoke execute on function public.get_auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_auth_user_id_by_email(text) to service_role;

comment on function public.get_auth_user_id_by_email(text) is
  'Returns the auth.users id for an email (case-insensitive), or null. SECURITY DEFINER, service_role only — used by the signup API to branch existing vs new accounts without leaking existence to clients.';
