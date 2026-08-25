-- Migration: add sector_id filter to get_active_organizations + sector filter options

-- 1. Re-create get_active_organizations with an added p_sectors parameter and WHERE clause.
DROP FUNCTION IF EXISTS public.get_active_organizations(timestamp with time zone, integer, integer, text, boolean, text[], text[], text[], uuid, text, text[]);

CREATE OR REPLACE FUNCTION public.get_active_organizations(
  min_date timestamp with time zone,
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_sse_only boolean default true,
  p_provinces text[] default null,
  p_municipalities text[] default null,
  p_org_types text[] default null,
  p_user_id uuid default null,  -- Ignored; kept for API compatibility. Use auth.uid() instead.
  p_sort text default 'org-asc',
  p_languages text[] default null,
  p_sectors text[] default null
)
RETURNS TABLE (
  id bigint,
  name text,
  slug text,
  description text,
  website text,
  location text,
  is_sse boolean,
  type text,
  "values" text,
  logo_url text,
  created_at timestamp with time zone,
  sse_rating text,
  sse_details jsonb,
  mission_statement text,
  values_list text[],
  values_rated jsonb,
  municipality text,
  province text,
  lat float8,
  lng float8,
  geocode_accuracy_type text,
  active_job_count bigint,
  total_count bigint,
  value_score float8,
  shared_values text[],
  sector_id text,
  language text,
  description_en text,
  description_fr text,
  mission_statement_en text,
  mission_statement_fr text,
  latest_job_posted timestamp with time zone
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_limit int;
  v_offset int;
  v_badge_cutoff timestamp with time zone;
BEGIN
  v_limit  := COALESCE(NULLIF(p_limit, 0),  20);
  v_offset := COALESCE(NULLIF(p_offset, 0), 0);

  -- Badge window: always the last 28 calendar days regardless of the directory filter.
  v_badge_cutoff := date_trunc('day', now() at time zone 'UTC') - interval '28 days';

  -- Security: ignore caller-supplied p_user_id; read directly from auth.uid().
  -- Supabase service-role calls bypass auth entirely (auth.uid() IS NULL), so
  -- value-match columns come back NULL for unauthenticated callers.
  v_user_id := auth.uid();

  RETURN QUERY
  WITH user_weights AS (
    SELECT uw.val, uw.weight
    FROM (
      SELECT
        elem->>'value' AS val,
        rank_weight((elem->>'rank')::int,
                    jsonb_array_length(COALESCE(p.values_rated, '[]'::jsonb))) AS weight
      FROM profiles p
      CROSS JOIN jsonb_array_elements(COALESCE(p.values_rated, '[]'::jsonb)) AS elem
      WHERE p.id = v_user_id
        AND (elem->>'value') IS NOT NULL
        AND (elem->>'rank') ~ '^\d+$'
    ) uw
  ),
  total_weight AS (
    SELECT COALESCE(SUM(weight), 0)::float8 AS total_w FROM user_weights
  ),
  org_counts AS (
    SELECT
      o.id, o.name, o.slug, o.description, o.website, o.location,
      o.is_sse, o.type, o.values, o.logo_url, o.created_at,
      o.sse_rating, o.sse_details, o.mission_statement, o.values_list,
      o.values_rated, o.municipality, o.province, o.lat, o.lng,
      o.geocode_accuracy_type, o.sector_id, o.language,
      o.description_en, o.description_fr, o.mission_statement_en,
      o.mission_statement_fr,
      count(j.id) FILTER (
        WHERE try_parse_job_date_posted(j.date_posted) >= v_badge_cutoff
      ) AS active_job_count,
      max(try_parse_job_date_posted(j.date_posted)) AS latest_job_posted
    FROM organizations o
    LEFT JOIN jobs j ON o.id = j.organization_id
      AND (min_date IS NULL OR try_parse_job_date_posted(j.date_posted) >= min_date)
    WHERE
      (min_date IS NULL OR j.id IS NOT NULL)
      AND (
        p_search IS NULL
        OR o.name ILIKE '%' || p_search || '%'
        OR o.description ILIKE '%' || p_search || '%'
        OR o.description_en ILIKE '%' || p_search || '%'
        OR o.description_fr ILIKE '%' || p_search || '%'
        OR o.mission_statement ILIKE '%' || p_search || '%'
        OR o.mission_statement_en ILIKE '%' || p_search || '%'
        OR o.mission_statement_fr ILIKE '%' || p_search || '%'
      )
      AND (p_sse_only IS FALSE OR o.is_sse = true)
      AND (p_provinces IS NULL OR cardinality(p_provinces) = 0 OR o.province = ANY(p_provinces))
      AND (p_municipalities IS NULL OR cardinality(p_municipalities) = 0 OR o.municipality = ANY(p_municipalities))
      AND (p_org_types IS NULL OR cardinality(p_org_types) = 0 OR o.type = ANY(p_org_types))
      AND (p_languages IS NULL OR cardinality(p_languages) = 0 OR o.language = ANY(p_languages))
      AND (p_sectors IS NULL OR cardinality(p_sectors) = 0 OR o.sector_id = ANY(p_sectors))
    GROUP BY o.id
  ),
  total_orgs AS (
    SELECT count(*)::bigint AS total_count FROM org_counts
  ),
  org_value_weights AS (
    SELECT oc.id AS org_id, x.val, MIN(x.org_w) AS org_w
    FROM org_counts oc
    CROSS JOIN LATERAL (
      SELECT elem->>'value' AS val,
             rank_weight((elem->>'rank')::int, jsonb_array_length(COALESCE(oc.values_rated, '[]'::jsonb))) AS org_w
      FROM jsonb_array_elements(COALESCE(oc.values_rated, '[]'::jsonb)) AS elem
      WHERE (elem->>'value') IS NOT NULL
        AND (elem->>'rank') ~ '^\d+$'
    ) x
    WHERE oc.values_rated IS NOT NULL AND jsonb_array_length(oc.values_rated) > 0
    GROUP BY oc.id, x.val
  ),
  weighted_value_base AS (
    SELECT oc.id AS org_id, oc.values_list,
      COALESCE(SUM(uw.weight * COALESCE(ovw.org_w, 1.0)) FILTER (WHERE uw.val = ANY(oc.values_list)), 0) AS overlap_num,
      COUNT(*) FILTER (WHERE uw.val = ANY(oc.values_list))::int AS shared_count,
      ARRAY(SELECT uw2.val FROM user_weights uw2 WHERE uw2.val = ANY(oc.values_list)) AS shared_vals
    FROM org_counts oc
    CROSS JOIN user_weights uw
    LEFT JOIN org_value_weights ovw ON ovw.org_id = oc.id AND ovw.val = uw.val
    GROUP BY oc.id, oc.values_list
  ),
  computed_matches AS (
    SELECT wb.org_id,
      CASE
        WHEN wb.values_list IS NULL OR array_length(wb.values_list, 1) IS NULL THEN NULL
        WHEN tw.total_w = 0 THEN NULL
        ELSE LEAST((wb.overlap_num / tw.total_w) + LEAST(wb.shared_count * 0.1, 0.3), 1.0)
      END AS value_score,
      CASE
        WHEN tw.total_w = 0 THEN NULL
        ELSE COALESCE(wb.shared_vals, '{}'::text[])
      END AS shared_values
    FROM weighted_value_base wb CROSS JOIN total_weight tw
  )
  SELECT
    oc.id, oc.name, oc.slug, oc.description, oc.website, oc.location,
    oc.is_sse, oc.type, oc.values, oc.logo_url, oc.created_at,
    oc.sse_rating, oc.sse_details, oc.mission_statement, oc.values_list,
    oc.values_rated, oc.municipality, oc.province, oc.lat, oc.lng,
    oc.geocode_accuracy_type, oc.active_job_count, t.total_count,
    cm.value_score, cm.shared_values, oc.sector_id, oc.language,
    oc.description_en, oc.description_fr, oc.mission_statement_en,
    oc.mission_statement_fr, oc.latest_job_posted
  FROM org_counts oc
  CROSS JOIN total_orgs t
  LEFT JOIN computed_matches cm ON cm.org_id = oc.id
  ORDER BY
    CASE WHEN p_sort = 'date-desc' THEN oc.latest_job_posted END DESC NULLS LAST,
    CASE WHEN p_sort = 'value-match-desc' OR p_sort = 'match-desc' THEN cm.value_score END DESC NULLS LAST,
    CASE WHEN p_sort = 'org-desc' THEN oc.name END DESC NULLS LAST,
    oc.name ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_organizations(
  timestamp with time zone, integer, integer, text, boolean,
  text[], text[], text[], uuid, text, text[], text[]
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_active_organizations IS
  'Organization directory listing. Accepts optional p_sectors text[] to filter by sector_id (sector taxonomy IDs).';

-- 2. Re-create get_organization_filter_options to return sectors.
CREATE OR REPLACE FUNCTION get_organization_filter_options(p_activity_days integer DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_min_date timestamp with time zone;
  v_global json;
  v_available json;
BEGIN
  IF p_activity_days IS NOT NULL THEN
    v_min_date := date_trunc('day', now() at time zone 'UTC') - (p_activity_days || ' days')::interval;
  END IF;

  SELECT json_build_object(
    'types', coalesce((SELECT json_agg(t.type) FROM (SELECT DISTINCT type FROM organizations WHERE type IS NOT NULL ORDER BY type) t), '[]'::json),
    'provinces', coalesce((SELECT json_agg(t.province) FROM (SELECT DISTINCT province FROM organizations WHERE province IS NOT NULL ORDER BY province) t), '[]'::json),
    'languages', coalesce((SELECT json_agg(t.language) FROM (SELECT DISTINCT language FROM organizations WHERE language IS NOT NULL ORDER BY language) t), '[]'::json),
    'municipalities', coalesce((SELECT json_agg(t) FROM (SELECT DISTINCT province, municipality FROM organizations WHERE province IS NOT NULL AND municipality IS NOT NULL ORDER BY province, municipality) t), '[]'::json),
    'sectors', coalesce((SELECT json_agg(t.sector_id) FROM (SELECT DISTINCT sector_id FROM organizations WHERE sector_id IS NOT NULL ORDER BY sector_id) t), '[]'::json)
  ) INTO v_global;

  IF p_activity_days IS NULL THEN
    v_available := v_global;
  ELSE
    SELECT json_build_object(
      'types', coalesce((SELECT json_agg(t.type) FROM (SELECT DISTINCT o.type FROM organizations o INNER JOIN jobs j ON j.organization_id = o.id WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date AND o.type IS NOT NULL ORDER BY o.type) t), '[]'::json),
      'provinces', coalesce((SELECT json_agg(t.province) FROM (SELECT DISTINCT o.province FROM organizations o INNER JOIN jobs j ON j.organization_id = o.id WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date AND o.province IS NOT NULL ORDER BY o.province) t), '[]'::json),
      'languages', coalesce((SELECT json_agg(t.language) FROM (SELECT DISTINCT o.language FROM organizations o INNER JOIN jobs j ON j.organization_id = o.id WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date AND o.language IS NOT NULL ORDER BY o.language) t), '[]'::json),
      'municipalities', coalesce((SELECT json_agg(t) FROM (SELECT DISTINCT o.province, o.municipality FROM organizations o INNER JOIN jobs j ON j.organization_id = o.id WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date AND o.province IS NOT NULL AND o.municipality IS NOT NULL ORDER BY o.province, o.municipality) t), '[]'::json),
      'sectors', coalesce((SELECT json_agg(t.sector_id) FROM (SELECT DISTINCT o.sector_id FROM organizations o INNER JOIN jobs j ON j.organization_id = o.id WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date AND o.sector_id IS NOT NULL ORDER BY o.sector_id) t), '[]'::json)
    ) INTO v_available;
  END IF;

  RETURN json_build_object(
    'global', v_global,
    'available', v_available
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_filter_options(integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_organization_filter_options(integer) IS
  'Returns global and activity-scoped filter options for the org index, including sector_id values.';
