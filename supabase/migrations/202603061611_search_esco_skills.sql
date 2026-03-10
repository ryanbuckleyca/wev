-- Search helper for canonical ESCO skills.
-- Supports label + alt label + definition matching with deterministic ranking.

CREATE OR REPLACE FUNCTION public.search_esco_skills(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  concept_uri text,
  label text,
  definition text,
  alt_labels text[],
  score integer
)
LANGUAGE sql
STABLE
AS $$
  WITH needle AS (
    SELECT NULLIF(lower(trim(coalesce(p_query, ''))), '') AS q
  ),
  matched AS (
    SELECT
      e.concept_uri,
      e.label,
      e.definition,
      e.alt_labels,
      CASE
        WHEN lower(e.label) = n.q THEN 600
        WHEN EXISTS (
          SELECT 1
          FROM unnest(e.alt_labels) AS alt
          WHERE lower(alt) = n.q
        ) THEN 550
        WHEN lower(e.label) LIKE n.q || '%' THEN 500
        WHEN EXISTS (
          SELECT 1
          FROM unnest(e.alt_labels) AS alt
          WHERE lower(alt) LIKE n.q || '%'
        ) THEN 450
        WHEN lower(e.label) LIKE '%' || n.q || '%' THEN 400
        WHEN EXISTS (
          SELECT 1
          FROM unnest(e.alt_labels) AS alt
          WHERE lower(alt) LIKE '%' || n.q || '%'
        ) THEN 350
        WHEN lower(coalesce(e.definition, '')) LIKE '%' || n.q || '%' THEN 100
        ELSE 0
      END AS score
    FROM public.esco_skills AS e
    CROSS JOIN needle AS n
    WHERE n.q IS NOT NULL
      AND (
        lower(e.label) LIKE '%' || n.q || '%'
        OR lower(coalesce(e.definition, '')) LIKE '%' || n.q || '%'
        OR EXISTS (
          SELECT 1
          FROM unnest(e.alt_labels) AS alt
          WHERE lower(alt) LIKE '%' || n.q || '%'
        )
      )
  )
  SELECT
    matched.concept_uri,
    matched.label,
    matched.definition,
    matched.alt_labels,
    matched.score
  FROM matched
  WHERE matched.score > 0
  ORDER BY matched.score DESC, matched.label ASC
  LIMIT greatest(1, least(coalesce(p_limit, 20), 100));
$$;

GRANT EXECUTE ON FUNCTION public.search_esco_skills(text, integer)
TO anon, authenticated, service_role;
