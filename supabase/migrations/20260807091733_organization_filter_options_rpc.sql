-- Migration: Add RPC to fetch organization filter options efficiently
-- This replaces the unpaginated full-table scans previously done in Next.js

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

  -- 1. Get global options
  SELECT json_build_object(
    'types', coalesce((SELECT json_agg(t.type) FROM (SELECT DISTINCT type FROM organizations WHERE type IS NOT NULL ORDER BY type) t), '[]'::json),
    'provinces', coalesce((SELECT json_agg(t.province) FROM (SELECT DISTINCT province FROM organizations WHERE province IS NOT NULL ORDER BY province) t), '[]'::json),
    'languages', coalesce((SELECT json_agg(t.language) FROM (SELECT DISTINCT language FROM organizations WHERE language IS NOT NULL ORDER BY language) t), '[]'::json),
    'municipalities', coalesce((SELECT json_agg(t) FROM (SELECT DISTINCT province, municipality FROM organizations WHERE province IS NOT NULL AND municipality IS NOT NULL ORDER BY province, municipality) t), '[]'::json)
  ) INTO v_global;

  -- 2. Get available options
  IF p_activity_days IS NULL THEN
    v_available := v_global;
  ELSE
    SELECT json_build_object(
      'types', coalesce((SELECT json_agg(t.type) FROM (SELECT DISTINCT o.type FROM organizations o INNER JOIN jobs j ON j.organization_id = o.id WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date AND o.type IS NOT NULL ORDER BY o.type) t), '[]'::json),
      'provinces', coalesce((SELECT json_agg(t.province) FROM (SELECT DISTINCT o.province FROM organizations o INNER JOIN jobs j ON j.organization_id = o.id WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date AND o.province IS NOT NULL ORDER BY o.province) t), '[]'::json),
      'languages', coalesce((SELECT json_agg(t.language) FROM (SELECT DISTINCT o.language FROM organizations o INNER JOIN jobs j ON j.organization_id = o.id WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date AND o.language IS NOT NULL ORDER BY o.language) t), '[]'::json),
      'municipalities', coalesce((SELECT json_agg(t) FROM (SELECT DISTINCT o.province, o.municipality FROM organizations o INNER JOIN jobs j ON j.organization_id = o.id WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date AND o.province IS NOT NULL AND o.municipality IS NOT NULL ORDER BY o.province, o.municipality) t), '[]'::json)
    ) INTO v_available;
  END IF;

  RETURN json_build_object(
    'global', v_global,
    'available', v_available
  );
END;
$$;
