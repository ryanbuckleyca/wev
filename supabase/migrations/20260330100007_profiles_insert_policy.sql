-- Allow users to insert their own profile row.
-- This is needed as a fallback when the auth trigger fails to create a profile
-- (e.g. after a data restore that wipes the profiles table).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can insert their own profile'
    AND tablename = 'profiles'
  ) THEN
    CREATE POLICY "Users can insert their own profile"
      ON public.profiles FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;
