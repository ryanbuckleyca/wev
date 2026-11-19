-- Migration B: retire the legacy organizations.type filter axis for readers.
--
-- - matched_jobs exposes org_governance_category (and subtype) instead of org_type
-- - get_organization_filter_options returns governance_categories instead of types
-- - get_active_organizations keeps p_org_types for signature compatibility but
--   ignores it; filtering is governance-only via p_governance_categories
--
-- Does NOT DROP organizations.type — dual-write / column drop is a later step
-- after admin + scraper stop requiring the legacy field.

-- ---------------------------------------------------------------------------
-- 1. Rebuild matched_jobs + maintain_jobs_public_column_grants
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maintain_jobs_public_column_grants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  cols text;
  view_cols text;
BEGIN
  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'jobs'
    AND c.column_name <> 'extra';

  IF cols IS NULL OR cols = '' THEN
    RAISE EXCEPTION 'maintain_jobs_public_column_grants: failed to list jobs columns';
  END IF;

  REVOKE SELECT ON TABLE public.jobs FROM anon, authenticated;
  EXECUTE format(
    'GRANT SELECT (%s) ON TABLE public.jobs TO anon, authenticated',
    cols
  );
  GRANT SELECT (extra), INSERT (extra), UPDATE (extra) ON TABLE public.jobs TO service_role;

  SELECT string_agg(format('j.%I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO view_cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'jobs'
    AND c.column_name <> 'extra';

  EXECUTE 'DROP VIEW IF EXISTS public.matched_jobs';
  EXECUTE format(
    $v$
    CREATE VIEW public.matched_jobs WITH (security_invoker = true) AS
    SELECT
      %s,
      s.name AS source,
      o.governance_category AS org_governance_category,
      o.governance_subtype AS org_governance_subtype,
      o.sector_id AS org_sector_id,
      coalesce(jm.score, 0) AS match_score,
      coalesce(jm.value_score, 0) AS value_score,
      coalesce(jm.skill_score, 0) AS skill_score
    FROM public.jobs j
    LEFT JOIN public.sources s ON j.source_id = s.id
    LEFT JOIN public.organizations o ON j.organization_id = o.id
    LEFT JOIN public.job_matches jm
      ON j.id = jm.job_id
      AND jm.user_id = auth.uid()
    $v$,
    view_cols
  );
  GRANT SELECT ON public.matched_jobs TO anon, authenticated, service_role;

  EXECUTE $c$
    COMMENT ON VIEW public.matched_jobs IS
      'Jobs with source name, match scores, and org governance/sector for bulletin facet filters. Excludes jobs.extra (provider dump).'
  $c$;
END;
$fn$;

COMMENT ON FUNCTION public.maintain_jobs_public_column_grants() IS
  'Re-grant anon/authenticated SELECT on all public.jobs columns except extra, '
  'and rebuild matched_jobs without extra (governance columns, not legacy type). '
  'Call after ADD COLUMN on public.jobs.';

SELECT public.maintain_jobs_public_column_grants();

-- ---------------------------------------------------------------------------
-- 2. Filter options: governance_categories instead of types
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organization_filter_options(
  p_activity_days integer DEFAULT NULL
)
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
    v_min_date := date_trunc('day', now() at time zone 'UTC')
      - (p_activity_days || ' days')::interval;
  END IF;

  SELECT json_build_object(
    'governance_categories', coalesce((
      SELECT json_agg(t.governance_category)
      FROM (
        SELECT DISTINCT governance_category
        FROM organizations
        WHERE governance_category IS NOT NULL
          AND governance_category <> 'EXCLUDED'
        ORDER BY governance_category
      ) t
    ), '[]'::json),
    'provinces', coalesce((
      SELECT json_agg(t.province)
      FROM (
        SELECT DISTINCT province FROM organizations
        WHERE province IS NOT NULL ORDER BY province
      ) t
    ), '[]'::json),
    'languages', coalesce((
      SELECT json_agg(t.language)
      FROM (
        SELECT DISTINCT language FROM organizations
        WHERE language IS NOT NULL ORDER BY language
      ) t
    ), '[]'::json),
    'municipalities', coalesce((
      SELECT json_agg(t)
      FROM (
        SELECT DISTINCT province, municipality FROM organizations
        WHERE province IS NOT NULL AND municipality IS NOT NULL
        ORDER BY province, municipality
      ) t
    ), '[]'::json),
    'sectors', coalesce((
      SELECT json_agg(t.sector_id)
      FROM (
        SELECT DISTINCT sector_id FROM organizations
        WHERE sector_id IS NOT NULL ORDER BY sector_id
      ) t
    ), '[]'::json)
  ) INTO v_global;

  IF p_activity_days IS NULL THEN
    v_available := v_global;
  ELSE
    SELECT json_build_object(
      'governance_categories', coalesce((
        SELECT json_agg(t.governance_category)
        FROM (
          SELECT DISTINCT o.governance_category
          FROM organizations o
          INNER JOIN jobs j ON j.organization_id = o.id
          WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date
            AND o.governance_category IS NOT NULL
            AND o.governance_category <> 'EXCLUDED'
          ORDER BY o.governance_category
        ) t
      ), '[]'::json),
      'provinces', coalesce((
        SELECT json_agg(t.province)
        FROM (
          SELECT DISTINCT o.province
          FROM organizations o
          INNER JOIN jobs j ON j.organization_id = o.id
          WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date
            AND o.province IS NOT NULL
          ORDER BY o.province
        ) t
      ), '[]'::json),
      'languages', coalesce((
        SELECT json_agg(t.language)
        FROM (
          SELECT DISTINCT o.language
          FROM organizations o
          INNER JOIN jobs j ON j.organization_id = o.id
          WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date
            AND o.language IS NOT NULL
          ORDER BY o.language
        ) t
      ), '[]'::json),
      'municipalities', coalesce((
        SELECT json_agg(t)
        FROM (
          SELECT DISTINCT o.province, o.municipality
          FROM organizations o
          INNER JOIN jobs j ON j.organization_id = o.id
          WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date
            AND o.province IS NOT NULL
            AND o.municipality IS NOT NULL
          ORDER BY o.province, o.municipality
        ) t
      ), '[]'::json),
      'sectors', coalesce((
        SELECT json_agg(t.sector_id)
        FROM (
          SELECT DISTINCT o.sector_id
          FROM organizations o
          INNER JOIN jobs j ON j.organization_id = o.id
          WHERE try_parse_job_date_posted(j.date_posted) >= v_min_date
            AND o.sector_id IS NOT NULL
          ORDER BY o.sector_id
        ) t
      ), '[]'::json)
    ) INTO v_available;
  END IF;

  RETURN json_build_object(
    'global', v_global,
    'available', v_available
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_filter_options(integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_organization_filter_options(integer) IS
  'Returns global and activity-scoped filter options for the org index, '
  'including governance_category values (SSE categories only; excludes EXCLUDED).';

-- ---------------------------------------------------------------------------
-- 3. get_active_organizations: ignore p_org_types (governance-only filter)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_active_organizations(
  timestamp with time zone, integer, integer, text, boolean,
  text[], text[], text[], uuid, text, text[], text[], text[]
);

CREATE OR REPLACE FUNCTION public.get_active_organizations(
  min_date timestamp with time zone,
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_sse_only boolean default true,
  p_provinces text[] default null,
  p_municipalities text[] default null,
  p_org_types text[] default null,  -- ignored; kept for API compatibility
  p_user_id uuid default null,
  p_sort text default 'org-asc',
  p_languages text[] default null,
  p_sectors text[] default null,
  p_governance_categories text[] default null
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
  latest_job_posted timestamp with time zone,
  governance_subtype text,
  governance_category text
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
  -- p_org_types is intentionally unused (Migration B retired the type axis).
  v_limit  := COALESCE(NULLIF(p_limit, 0),  20);
  v_offset := COALESCE(NULLIF(p_offset, 0), 0);
  v_badge_cutoff := date_trunc('day', now() at time zone 'UTC') - interval '28 days';
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
      o.mission_statement_fr, o.governance_subtype, o.governance_category,
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
      AND (p_languages IS NULL OR cardinality(p_languages) = 0 OR o.language = ANY(p_languages))
      AND (p_sectors IS NULL OR cardinality(p_sectors) = 0 OR o.sector_id = ANY(p_sectors))
      AND (
        p_governance_categories IS NULL
        OR cardinality(p_governance_categories) = 0
        OR o.governance_category = ANY(p_governance_categories)
      )
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
    oc.mission_statement_fr, oc.latest_job_posted,
    oc.governance_subtype, oc.governance_category
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
  text[], text[], text[], uuid, text, text[], text[], text[]
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_active_organizations(
  timestamp with time zone, integer, integer, text, boolean,
  text[], text[], text[], uuid, text, text[], text[], text[]
) IS
  'Organization directory listing. Filters by p_governance_categories (and '
  'sectors/geo/etc). p_org_types is ignored after Migration B.';
