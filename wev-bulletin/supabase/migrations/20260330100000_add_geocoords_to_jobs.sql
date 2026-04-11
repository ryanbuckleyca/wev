ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS lat float8,
  ADD COLUMN IF NOT EXISTS lng float8,
  ADD COLUMN IF NOT EXISTS geocode_accuracy_type text;
