-- Redefine f_unaccent to be more robust during index creation (ensuring schema-qualified calls)
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT public.unaccent($1);
$$;

-- Trigram indices for similarity search (%%)
CREATE INDEX IF NOT EXISTS esco_skills_pref_en_trgm_idx ON esco_skills USING GIN (lower(public.f_unaccent(preferred_label_en)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS esco_skills_pref_fr_trgm_idx ON esco_skills USING GIN (lower(public.f_unaccent(preferred_label_fr)) gin_trgm_ops);

-- B-tree indices for prefix search (LIKE 'p%%')
CREATE INDEX IF NOT EXISTS esco_skills_pref_en_prefix_idx ON esco_skills (lower(public.f_unaccent(preferred_label_en)) text_pattern_ops);
CREATE INDEX IF NOT EXISTS esco_skills_pref_fr_prefix_idx ON esco_skills (lower(public.f_unaccent(preferred_label_fr)) text_pattern_ops);
