-- Migration: Add verify_user_password RPC
-- Description: Allows authenticated users to verify their password directly against the database.
-- This bypasses GoTrue's public-facing CAPTCHA and rate limiting during sensitive actions.

-- Ensure pgcrypto is enabled (required for crypt function)
-- In Supabase, this is often already in the 'extensions' schema
create extension if not exists pgcrypto with schema extensions;

create or replace function public.verify_user_password(password text)
returns text
language plpgsql
security definer -- required to access auth.users
set search_path = public, auth, extensions
as $$
declare
  stored_password text;
begin
  -- Get the encrypted password for the current user
  select u.encrypted_password into stored_password
  from auth.users u
  where u.id = auth.uid();

  if stored_password is null then
    return 'no_password';
  end if;

  if stored_password = crypt(password::text, stored_password) then
    return 'match';
  else
    return 'mismatch';
  end if;
end;
$$;



-- Ensure only authenticated users can call this
revoke all on function public.verify_user_password(text) from public;
grant execute on function public.verify_user_password(text) to authenticated;

comment on function public.verify_user_password(text) is 'Verifies a user password against the encrypted_password in auth.users using pgcrypto.';
