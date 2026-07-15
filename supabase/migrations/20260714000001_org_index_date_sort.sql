-- Add date-desc sort support for the organizations index.
-- Sorts by the newest active job posting date for each organization.

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
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  authenticated_user_id uuid;
  v_limit integer;
  v_offset integer;
BEGIN
  -- Use auth.uid() instead of trusting p_user_id parameter to prevent unauthorized profile access.
  authenticated_user_id := auth.uid();

  -- Clamp pagination parameters to prevent unbounded queries
  v_limit := LEAST(COALESCE(p_limit, 20), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN QUERY
  WITH user_data AS (
    SELECT p.values_rated, p.values
    FROM profiles p
    WHERE authenticated_user_id IS NOT NULL
      AND p.id = authenticated_user_id
  ),
  user_items AS (
    -- Qualify user_data.values_rated to avoid ambiguity with the RETURNS TABLE column.
    -- Guard against NULL values_rated: COALESCE ensures we always have a valid jsonb array.
    SELECT elem->>'value' AS val, (elem->>'rank')::int AS rnk
    FROM user_data, jsonb_array_elements(COALESCE(user_data.values_rated, '[]'::jsonb)) AS elem
    WHERE (elem->>'value') IS NOT NULL
      AND (elem->>'rank') ~ '^\d+$'
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
      count(j.id) AS active_job_count,
      max(try_parse_job_date_posted(j.date_posted)) AS latest_job_posted
    FROM organizations o
    JOIN jobs j ON o.id = j.organization_id
    WHERE try_parse_job_date_posted(j.date_posted) >= min_date
      AND (p_search IS NULL OR o.name ILIKE '%' || p_search || '%' OR o.description ILIKE '%' || p_search || '%')
      AND (p_sse_only IS FALSE OR o.is_sse = true)
      AND (p_provinces IS NULL OR cardinality(p_provinces) = 0 OR o.province = ANY(p_provinces))
      AND (p_municipalities IS NULL OR cardinality(p_municipalities) = 0 OR o.municipality = ANY(p_municipalities))
      AND (p_org_types IS NULL OR cardinality(p_org_types) = 0 OR o.type = ANY(p_org_types))
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
    t.total_count,
    cm.value_score,
    cm.shared_values
  FROM org_counts oc
  CROSS JOIN total_orgs t
  LEFT JOIN computed_matches cm ON cm.org_id = oc.id
  ORDER BY
    -- Date sort: most recent active job posting first
    CASE WHEN p_sort = 'date-desc' THEN oc.latest_job_posted END DESC NULLS LAST,
    -- Match sort: value-score descending, NULLs last (orgs without values sink to bottom)
    CASE WHEN p_sort = 'value-match-desc' OR p_sort = 'match-desc' THEN cm.value_score END DESC NULLS LAST,
    -- Explicit name-descending when requested; ignored otherwise (evaluates to NULL → no effect)
    CASE WHEN p_sort = 'org-desc' THEN oc.name END DESC NULLS LAST,
    -- Tiebreaker / default: name ascending always applies last
    oc.name ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_organizations(timestamp with time zone, integer, integer, text, boolean, text[], text[], text[], uuid, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_active_organizations(timestamp with time zone, integer, integer, text, boolean, text[], text[], text[], uuid, text) IS
  'Returns organizations with active job counts, optional value-match scoring, filtering, and pagination. '
  'Date filter: jobs.date_posted is parsed via try_parse_job_date_posted(); unparseable rows are excluded. '
  'Anonymous access: EXECUTE is granted to anon for the public org index; when auth.uid() IS NULL, '
  'profile data is not read and value_score/shared_values are NULL. '
  'Compatibility: p_user_id is retained in the signature for existing RPC callers but ignored; auth.uid() is used for profile access.';
