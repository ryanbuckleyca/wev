-- Migration: Add normalized location columns to organizations and update get_active_organizations RPC

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS lat float8,
  ADD COLUMN IF NOT EXISTS lng float8,
  ADD COLUMN IF NOT EXISTS geocode_accuracy_type text;
DROP FUNCTION IF EXISTS public.get_active_organizations(timestamp with time zone, integer, integer);
CREATE OR REPLACE FUNCTION public.get_active_organizations(
  min_date timestamp with time zone,
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_sse_only boolean default true,
  p_provinces text[] default null,
  p_municipalities text[] default null,
  p_org_types text[] default null
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
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_offset integer;
BEGIN
  -- Clamp pagination parameters to prevent unbounded queries
  v_limit := LEAST(COALESCE(p_limit, 20), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN QUERY
  WITH org_counts AS (
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
    WHERE j.date_posted >= min_date
      AND (p_search IS NULL OR o.name ILIKE '%' || p_search || '%' OR o.description ILIKE '%' || p_search || '%')
      AND (p_sse_only IS FALSE OR o.is_sse = true)
      AND (p_provinces IS NULL OR cardinality(p_provinces) = 0 OR o.province = ANY(p_provinces))
      AND (p_municipalities IS NULL OR cardinality(p_municipalities) = 0 OR o.municipality = ANY(p_municipalities))
      AND (p_org_types IS NULL OR cardinality(p_org_types) = 0 OR o.type = ANY(p_org_types))
    GROUP BY o.id
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
    (SELECT count(*) FROM org_counts)::bigint AS total_count
  FROM org_counts oc
  ORDER BY oc.name ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_organizations(timestamp with time zone, integer, integer, text, boolean, text[], text[], text[]) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_active_organizations(timestamp with time zone, integer, integer, text, boolean, text[], text[], text[]) IS
  'Returns organizations with active job counts within the given age window, filtered and paginated.';
