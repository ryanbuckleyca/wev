-- Migration: Add verify_user_password RPC
-- Description: Allows authenticated users to verify their password directly against the database.
-- This bypasses GoTrue's public-facing CAPTCHA and rate limiting during sensitive actions.

-- Ensure pgcrypto is enabled (required for crypt function)
-- In Supabase, this is often already in the 'extensions' schema
create extension if not exists pgcrypto with schema extensions;

create or replace function public.verify_user_password(password text)
returns boolean
language plpgsql
security definer -- required to access auth.users
set search_path = public, auth, extensions
as $$
declare
  is_valid boolean;
begin
  -- Check if the provided password matches the one in auth.users for the current user
  -- We use explicit casts to text to ensure the crypt function signature matches
  select 
    (u.encrypted_password = crypt(password::text, u.encrypted_password::text))
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
