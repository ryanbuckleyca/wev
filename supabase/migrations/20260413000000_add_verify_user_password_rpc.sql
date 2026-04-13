-- Migration: Add verify_user_password RPC
-- Description: Allows authenticated users to verify their password directly against the database.
-- This bypasses GoTrue's public-facing CAPTCHA and rate limiting during sensitive actions.

create or replace function public.verify_user_password(password text)
returns boolean
language plpgsql
security definer -- required to access auth.users
set search_path = public, auth
as $$
declare
  is_valid boolean;
begin
  -- Check if the provided password matches the one in auth.users for the current user
  select 
    (u.encrypted_password = crypt(password, u.encrypted_password))
  into is_valid
  from auth.users u
  where u.id = auth.uid();

  return coalesce(is_valid, false);
end;
$$;

-- Ensure only authenticated users can call this
revoke all on function public.verify_user_password(text) from public;
grant execute on function public.verify_user_password(text) to authenticated;

comment on function public.verify_user_password(text) is 'Verifies a user password against the encrypted_password in auth.users using pgcrypto.';
