-- Simplified bulk ESCO search: fast label matching across multiple terms.
-- Uses the existing trigram indexes on preferred_label_en/fr.
-- Replaces the complex v1 with a straightforward LIKE across all terms.

CREATE OR REPLACE FUNCTION public.search_esco_skills_bulk(
  p_queries text[],
  p_limit integer DEFAULT 20,
  p_locale text DEFAULT 'en'
)
RETURNS TABLE (
  concept_uri text,
  term text,
  definition text,
  skill_type text,
  reuse_level text,
  score integer
)
LANGUAGE sql
STABLE
AS $$
  WITH
  loc AS (
    SELECT CASE WHEN lower(coalesce(p_locale,'en')) = 'fr' THEN 'fr' ELSE 'en' END AS v
  ),
  queries AS (
    SELECT DISTINCT lower(trim(q)) AS q
    FROM unnest(p_queries) AS q
    WHERE trim(q) <> ''
  ),
  matched AS (
    SELECT DISTINCT ON (e.concept_uri)
      e.concept_uri,
      CASE WHEN (SELECT v FROM loc) = 'fr'
        THEN coalesce(e.preferred_label_fr, e.preferred_label_en)
        ELSE coalesce(e.preferred_label_en, e.preferred_label_fr)
      END AS term,
      CASE WHEN (SELECT v FROM loc) = 'fr'
        THEN coalesce(e.description_fr, e.description_en)
        ELSE coalesce(e.description_en, e.description_fr)
      END AS definition,
      e.skill_type,
      e.reuse_level,
      CASE
        WHEN lower(coalesce(e.preferred_label_en, e.preferred_label_fr)) = ANY(SELECT q FROM queries) THEN 700
        WHEN lower(coalesce(e.preferred_label_en, e.preferred_label_fr)) LIKE ANY(SELECT q || '%' FROM queries) THEN 600
        WHEN lower(coalesce(e.preferred_label_en, e.preferred_label_fr)) LIKE ANY(SELECT '%' || q || '%' FROM queries) THEN 500
        ELSE 200
      END AS score
    FROM public.esco_skills e
    WHERE
      lower(coalesce(e.preferred_label_en, '')) LIKE ANY(SELECT '%' || q || '%' FROM queries)
      OR lower(coalesce(e.preferred_label_fr, '')) LIKE ANY(SELECT '%' || q || '%' FROM queries)
  )
  SELECT concept_uri, term, definition, skill_type, reuse_level, score
  FROM matched
  ORDER BY score DESC, term ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_esco_skills_bulk(text[], integer, text)
TO anon, authenticated, service_role;
