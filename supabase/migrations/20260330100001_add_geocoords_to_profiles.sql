ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lat float8,
  ADD COLUMN IF NOT EXISTS lng float8,
  ADD COLUMN IF NOT EXISTS location_display_name text;
