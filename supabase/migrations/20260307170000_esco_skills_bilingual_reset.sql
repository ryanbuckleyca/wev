-- Reset ESCO skills index to API-sourced bilingual structure (EN/FR).
-- This intentionally rebuilds the table from scratch.

DROP FUNCTION IF EXISTS public.search_esco_skills(text, integer);
DROP FUNCTION IF EXISTS public.search_esco_skills(text, integer, text);
DROP TABLE IF EXISTS public.esco_skills;
CREATE TABLE public.esco_skills (
  concept_uri text PRIMARY KEY,
  skill_type text NOT NULL DEFAULT '',
  reuse_level text NOT NULL DEFAULT '',
  preferred_label_en text NOT NULL,
  preferred_label_fr text NOT NULL,
  alternative_label_en text[] NOT NULL DEFAULT '{}'::text[],
  alternative_label_fr text[] NOT NULL DEFAULT '{}'::text[],
  description_en text NOT NULL DEFAULT '',
  description_fr text NOT NULL DEFAULT '',
  scope_note_en text NOT NULL DEFAULT '',
  scope_note_fr text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.esco_skills IS 'ESCO skill taxonomy sourced from ESCO API, localized EN/FR.';
COMMENT ON COLUMN public.esco_skills.concept_uri IS 'Stable ESCO concept URI identifier.';
COMMENT ON COLUMN public.esco_skills.skill_type IS 'ESCO skill type tail value (e.g. skill, knowledge).';
COMMENT ON COLUMN public.esco_skills.reuse_level IS 'ESCO reuse level tail value (e.g. transversal, cross-sector).';
COMMENT ON COLUMN public.esco_skills.preferred_label_en IS 'Preferred ESCO skill label in English.';
COMMENT ON COLUMN public.esco_skills.preferred_label_fr IS 'Preferred ESCO skill label in French.';
COMMENT ON COLUMN public.esco_skills.alternative_label_en IS 'Alternative labels in English.';
COMMENT ON COLUMN public.esco_skills.alternative_label_fr IS 'Alternative labels in French.';
COMMENT ON COLUMN public.esco_skills.description_en IS 'Description in English.';
COMMENT ON COLUMN public.esco_skills.description_fr IS 'Description in French.';
COMMENT ON COLUMN public.esco_skills.scope_note_en IS 'Scope note in English.';
COMMENT ON COLUMN public.esco_skills.scope_note_fr IS 'Scope note in French.';
CREATE INDEX idx_esco_skills_pref_en_lower ON public.esco_skills ((lower(preferred_label_en)));
CREATE INDEX idx_esco_skills_pref_fr_lower ON public.esco_skills ((lower(preferred_label_fr)));
CREATE INDEX idx_esco_skills_alt_en_gin ON public.esco_skills USING gin (alternative_label_en);
CREATE INDEX idx_esco_skills_alt_fr_gin ON public.esco_skills USING gin (alternative_label_fr);
ALTER TABLE public.esco_skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read ESCO skills" ON public.esco_skills;
CREATE POLICY "Public can read ESCO skills"
  ON public.esco_skills
  FOR SELECT
  USING (true);
-- Locale-aware ESCO search helper.
CREATE OR REPLACE FUNCTION public.search_esco_skills(
  p_query text,
  p_limit integer DEFAULT 20,
  p_locale text DEFAULT 'en'
)
RETURNS TABLE (
  concept_uri text,
  term text,
  definition text,
  scope_note text,
  skill_type text,
  reuse_level text,
  matched_alias text,
  score integer
)
LANGUAGE sql
STABLE
AS $$
  WITH params AS (
    SELECT
      NULLIF(lower(trim(coalesce(p_query, ''))), '') AS q,
      CASE
        WHEN lower(coalesce(p_locale, 'en')) = 'fr' THEN 'fr'
        ELSE 'en'
      END AS loc,
      greatest(1, least(coalesce(p_limit, 20), 20)) AS lim
  ),
  localized AS (
    SELECT
      e.concept_uri,
      CASE
        WHEN p.loc = 'fr' THEN coalesce(e.preferred_label_fr, e.preferred_label_en)
        ELSE coalesce(e.preferred_label_en, e.preferred_label_fr)
      END AS term,
      CASE
        WHEN p.loc = 'fr' THEN coalesce(e.description_fr, e.description_en)
        ELSE coalesce(e.description_en, e.description_fr)
      END AS definition,
      CASE
        WHEN p.loc = 'fr' THEN coalesce(e.scope_note_fr, e.scope_note_en)
        ELSE coalesce(e.scope_note_en, e.scope_note_fr)
      END AS scope_note,
      e.skill_type,
      e.reuse_level,
      CASE
        WHEN p.loc = 'fr' THEN
          array_remove(
            coalesce(e.alternative_label_fr, '{}'::text[])
            || coalesce(e.alternative_label_en, '{}'::text[]),
            ''
          )
        ELSE
          array_remove(
            coalesce(e.alternative_label_en, '{}'::text[])
            || coalesce(e.alternative_label_fr, '{}'::text[]),
            ''
          )
      END AS aliases,
      p.q
    FROM public.esco_skills AS e
    CROSS JOIN params AS p
    WHERE p.q IS NOT NULL
  ),
  scored AS (
    SELECT
      l.concept_uri,
      l.term,
      l.definition,
      l.scope_note,
      l.skill_type,
      l.reuse_level,
      (
        SELECT alt
        FROM unnest(l.aliases) AS alt
        WHERE
          lower(alt) = l.q
          OR lower(alt) LIKE l.q || '%'
          OR lower(alt) LIKE '%' || l.q || '%'
        ORDER BY
          CASE
            WHEN lower(alt) = l.q THEN 1
            WHEN lower(alt) LIKE l.q || '%' THEN 2
            ELSE 3
          END,
          length(alt)
        LIMIT 1
      ) AS matched_alias,
      CASE
        WHEN lower(l.term) = l.q THEN 700
        WHEN EXISTS (
          SELECT 1
          FROM unnest(l.aliases) AS alt
          WHERE lower(alt) = l.q
        ) THEN 650
        WHEN lower(l.term) LIKE l.q || '%' THEN 600
        WHEN EXISTS (
          SELECT 1
          FROM unnest(l.aliases) AS alt
          WHERE lower(alt) LIKE l.q || '%'
        ) THEN 550
        WHEN lower(l.term) LIKE '%' || l.q || '%' THEN 500
        WHEN EXISTS (
          SELECT 1
          FROM unnest(l.aliases) AS alt
          WHERE lower(alt) LIKE '%' || l.q || '%'
        ) THEN 450
        WHEN lower(coalesce(l.definition, '')) LIKE '%' || l.q || '%' THEN 200
        WHEN lower(coalesce(l.scope_note, '')) LIKE '%' || l.q || '%' THEN 150
        ELSE 0
      END AS score
    FROM localized AS l
  )
  SELECT
    s.concept_uri,
    s.term,
    s.definition,
    s.scope_note,
    s.skill_type,
    s.reuse_level,
    s.matched_alias,
    s.score
  FROM scored AS s
  WHERE s.score > 0
  ORDER BY s.score DESC, s.term ASC
  LIMIT (SELECT lim FROM params);
$$;
GRANT EXECUTE ON FUNCTION public.search_esco_skills(text, integer, text)
TO anon, authenticated, service_role;
