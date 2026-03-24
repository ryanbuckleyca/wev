-- Bulk variant of search_esco_skills: accepts an array of query terms and
-- returns deduplicated results across all of them in a single round-trip.
-- This replaces N sequential RPC calls with one, dramatically reducing
-- latency for batch skill-tagging runs.

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
  WITH params AS (
    SELECT
      CASE
        WHEN lower(coalesce(p_locale, 'en')) = 'fr' THEN 'fr'
        ELSE 'en'
      END AS loc,
      greatest(1, least(coalesce(p_limit, 20), 20)) AS lim,
      -- Normalise and deduplicate the query terms
      array_agg(DISTINCT lower(trim(q))) FILTER (WHERE trim(q) <> '') AS queries
    FROM unnest(p_queries) AS q
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
      p.queries
    FROM public.esco_skills AS e
    CROSS JOIN params AS p
    WHERE p.queries IS NOT NULL
      -- Early filter: skill must match at least one query term
      AND (
        (p.loc = 'en' AND EXISTS (
          SELECT 1 FROM unnest(p.queries) AS q
          WHERE lower(e.preferred_label_en) LIKE '%' || q || '%'
             OR EXISTS (SELECT 1 FROM unnest(e.alternative_label_en) ext WHERE lower(ext) LIKE '%' || q || '%')
             OR EXISTS (SELECT 1 FROM unnest(e.alternative_label_fr) ext WHERE lower(ext) LIKE '%' || q || '%')
        ))
        OR
        (p.loc = 'fr' AND EXISTS (
          SELECT 1 FROM unnest(p.queries) AS q
          WHERE lower(e.preferred_label_fr) LIKE '%' || q || '%'
             OR EXISTS (SELECT 1 FROM unnest(e.alternative_label_fr) ext WHERE lower(ext) LIKE '%' || q || '%')
             OR EXISTS (SELECT 1 FROM unnest(e.alternative_label_en) ext WHERE lower(ext) LIKE '%' || q || '%')
        ))
      )
  ),
  scored AS (
    SELECT
      l.concept_uri,
      l.term,
      l.definition,
      l.skill_type,
      l.reuse_level,
      -- Score = best match across all query terms
      (
        SELECT max(
          CASE
            WHEN lower(l.term) = q THEN 700
            WHEN EXISTS (SELECT 1 FROM unnest(l.aliases) alt WHERE lower(alt) = q) THEN 650
            WHEN lower(l.term) LIKE q || '%' THEN 600
            WHEN EXISTS (SELECT 1 FROM unnest(l.aliases) alt WHERE lower(alt) LIKE q || '%') THEN 550
            WHEN lower(l.term) LIKE '%' || q || '%' THEN 500
            WHEN EXISTS (SELECT 1 FROM unnest(l.aliases) alt WHERE lower(alt) LIKE '%' || q || '%') THEN 450
            WHEN lower(coalesce(l.definition, '')) LIKE '%' || q || '%' THEN 200
            ELSE 0
          END
        )
        FROM unnest(l.queries) AS q
      ) AS score
    FROM localized AS l
  )
  SELECT
    s.concept_uri,
    s.term,
    s.definition,
    s.skill_type,
    s.reuse_level,
    s.score
  FROM scored AS s
  WHERE s.score > 0
  ORDER BY s.score DESC, s.term ASC
  LIMIT (SELECT lim FROM params);
$$;

GRANT EXECUTE ON FUNCTION public.search_esco_skills_bulk(text[], integer, text)
TO anon, authenticated, service_role;
