-- ideal_work_environment was a temporary free-text column used for early location matching
-- via keyword scoring. It has been replaced by structured lat/lng/location_display_name fields
-- populated from the cities lookup. No user data needs to be preserved.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS ideal_work_environment;
