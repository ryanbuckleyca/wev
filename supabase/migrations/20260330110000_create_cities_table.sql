CREATE TABLE IF NOT EXISTS public.cities (
  id serial PRIMARY KEY,
  name text NOT NULL,
  province text NOT NULL,
  display_name text NOT NULL,  -- e.g. "Montréal, QC"
  lat float8 NOT NULL,
  lng float8 NOT NULL,
  UNIQUE (name, province)
);
-- Index for fast prefix search
CREATE INDEX IF NOT EXISTS idx_cities_name_lower ON public.cities (lower(name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_cities_display_name_lower ON public.cities (lower(display_name) text_pattern_ops);
-- RLS: allow public read (no auth required for city search)
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cities_public_read" ON public.cities FOR SELECT USING (true);
