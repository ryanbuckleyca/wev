CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
-- Create an immutable wrapper function for unaccent so it can be used in a GENERATED column
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text AS
$func$
SELECT public.unaccent('public.unaccent', $1)
$func$  LANGUAGE sql IMMUTABLE STRICT;
-- Add a stored generated column for the searchable name
ALTER TABLE public.cities 
ADD COLUMN IF NOT EXISTS search_name text 
GENERATED ALWAYS AS (public.f_unaccent(lower(display_name))) STORED;
-- Create an index to optimise prefix searches
CREATE INDEX IF NOT EXISTS idx_cities_search_name 
ON public.cities (search_name text_pattern_ops);
