-- Migration: Add value-match scoring and p_user_id to get_active_organizations RPC.
-- Consolidates _000001 (org_matches) + _000002 (fix ambiguous values_rated reference)
-- into a single clean migration.

-- Drop old 8-argument signature created by 20260708000000
DROP FUNCTION IF EXISTS public.get_active_organizations(timestamp with time zone, integer, integer, text, boolean, text[], text[], text[]);

-- NOTE: The ILIKE search on o.name / o.description benefits from a pg_trgm GIN index:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS orgs_name_trgm_idx
--     ON organizations USING gin (name gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS orgs_description_trgm_idx
--     ON organizations USING gin (description gin_trgm_ops);
-- Add these in a follow-up migration once pg_trgm is confirmed enabled on the instance.

CREATE OR REPLACE FUNCTION public.get_active_organizations(
  min_date timestamp with time zone,
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_sse_only boolean default true,
  p_provinces text[] default null,
  p_municipalities text[] default null,
  p_org_types text[] default null,
  p_user_id uuid default null,
  p_sort text default 'org-asc'
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
  shared_values text[]
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH user_data AS (
    SELECT p.values_rated, p.values
    FROM profiles p
    WHERE p.id = p_user_id
  ),
  user_items AS (
    -- Qualify user_data.values_rated to avoid ambiguity with the RETURNS TABLE column
    SELECT elem->>'value' AS val, (elem->>'rank')::int AS rnk
    FROM user_data, jsonb_array_elements(user_data.values_rated) AS elem
    WHERE (elem->>'value') IS NOT NULL
  ),
  total_user_items AS (
    SELECT COUNT(*)::int AS n FROM user_items
  ),
  user_weights AS (
    SELECT ui.val, rank_weight(ui.rnk, t.n) AS weight
    FROM user_items ui CROSS JOIN total_user_items t
  ),
  total_weight AS (
    SELECT COALESCE(SUM(weight), 0) AS total_w FROM user_weights
  ),
  org_counts AS (
    SELECT
      o.id,
      o.name,
      o.slug,
      o.description,
      o.website,
      o.location,
      o.is_sse,
      o.type,
      o.values,
      o.logo_url,
      o.created_at,
      o.sse_rating,
      o.sse_details,
      o.mission_statement,
      o.values_list,
      o.values_rated,
      o.municipality,
      o.province,
      o.lat,
      o.lng,
      o.geocode_accuracy_type,
      count(j.id) AS active_job_count
    FROM organizations o
    JOIN jobs j ON o.id = j.organization_id
    WHERE j.date_posted::timestamp with time zone >= min_date
      AND (p_search IS NULL OR o.name ILIKE '%' || p_search || '%' OR o.description ILIKE '%' || p_search || '%')
      AND (p_sse_only IS FALSE OR o.is_sse = true)
      AND (p_provinces IS NULL OR cardinality(p_provinces) = 0 OR o.province = ANY(p_provinces))
      AND (p_municipalities IS NULL OR cardinality(p_municipalities) = 0 OR o.municipality = ANY(p_municipalities))
      AND (p_org_types IS NULL OR cardinality(p_org_types) = 0 OR o.type = ANY(p_org_types))
    GROUP BY o.id
  ),
  org_value_weights AS (
    SELECT oc.id AS org_id, x.val, MIN(x.org_w) AS org_w
    FROM org_counts oc
    CROSS JOIN LATERAL (
      SELECT elem->>'value' AS val,
             rank_weight((elem->>'rank')::int, jsonb_array_length(oc.values_rated)) AS org_w
      FROM jsonb_array_elements(oc.values_rated) AS elem
      WHERE (elem->>'value') IS NOT NULL
    ) x
    WHERE p_user_id IS NOT NULL AND oc.values_rated IS NOT NULL AND jsonb_array_length(oc.values_rated) > 0
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
        WHEN tw.total_w = 0 THEN 0.0
        ELSE LEAST((wb.overlap_num / tw.total_w) + LEAST(wb.shared_count * 0.1, 0.3), 1.0)
      END AS value_score,
      COALESCE(wb.shared_vals, '{}'::text[]) AS shared_values
    FROM weighted_value_base wb CROSS JOIN total_weight tw
  )
  SELECT
    oc.id,
    oc.name,
    oc.slug,
    oc.description,
    oc.website,
    oc.location,
    oc.is_sse,
    oc.type,
    oc.values,
    oc.logo_url,
    oc.created_at,
    oc.sse_rating,
    oc.sse_details,
    oc.mission_statement,
    oc.values_list,
    oc.values_rated,
    oc.municipality,
    oc.province,
    oc.lat,
    oc.lng,
    oc.geocode_accuracy_type,
    oc.active_job_count,
    (SELECT count(*) FROM org_counts)::bigint AS total_count,
    cm.value_score,
    cm.shared_values
  FROM org_counts oc
  LEFT JOIN computed_matches cm ON cm.org_id = oc.id
  ORDER BY
    CASE WHEN p_sort = 'value-match-desc' OR p_sort = 'match-desc' THEN cm.value_score END DESC NULLS LAST,
    CASE WHEN p_sort = 'org-desc' THEN oc.name END DESC,
    oc.name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_organizations(timestamp with time zone, integer, integer, text, boolean, text[], text[], text[], uuid, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_active_organizations(timestamp with time zone, integer, integer, text, boolean, text[], text[], text[], uuid, text) IS
  'Returns organizations with active job counts, optional value-match scoring, filtering, and pagination.';
