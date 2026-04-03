-- Replace recalculate_matches_for_user to use municipality/province exact matching
-- instead of the old ideal_work_environment text-overlap approach.
--
-- Location score logic (mirrors match-calculator.ts computeLocationScore):
--   1. remote-on-remote → 1.0
--   2. remote job, non-remote user → NULL
--   3. physical/hybrid job, remote-only user → NULL
--   4. hybrid job, user doesn't include hybrid or office → NULL
--   5. exact municipality + province match (accent-insensitive) → 1.0
--   6. no coordinates on job → NULL
--   7. distance bands via earthdistance: ≤50km → 1.0, ≤150km → 0.5, else → 0.0
--
-- Note: accent-insensitive comparison uses unaccent() (requires pg_trgm or unaccent extension).
-- Falls back to lower() only if unaccent is unavailable.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE OR REPLACE FUNCTION location_score_for_pair(
  p_user_municipality text,
  p_user_province     text,
  p_user_lat          float8,
  p_user_lng          float8,
  p_user_work_types   text[],
  p_job_municipality  text,
  p_job_province      text,
  p_job_lat           float8,
  p_job_lng           float8,
  p_job_accuracy_type text,
  p_job_work_type     text
) RETURNS float8 LANGUAGE plpgsql IMMUTABLE AS $func$
DECLARE
  v_user_includes_remote boolean;
  v_job_is_remote        boolean;
  v_job_is_hybrid        boolean;
  v_user_remote_only     boolean;
  v_distance_km          float8;
BEGIN
  v_user_includes_remote := 'remote' = ANY(COALESCE(p_user_work_types, '{}'::text[]));
  v_job_is_remote        := p_job_work_type = 'remote';
  v_job_is_hybrid        := p_job_work_type = 'hybrid';
  v_user_remote_only     := array_length(p_user_work_types, 1) > 0
                            AND NOT EXISTS (
                              SELECT 1 FROM unnest(p_user_work_types) wt WHERE wt <> 'remote'
                            );

  -- 1. remote-on-remote
  IF v_user_includes_remote AND v_job_is_remote THEN RETURN 1.0; END IF;

  -- 2. remote job, non-remote user
  IF v_job_is_remote AND NOT v_user_includes_remote THEN RETURN NULL; END IF;

  -- 3. physical/hybrid job, remote-only user
  IF p_job_work_type <> 'remote' AND v_user_remote_only THEN RETURN NULL; END IF;

  -- 4. hybrid job, user doesn't include hybrid or office
  IF v_job_is_hybrid
     AND NOT ('hybrid' = ANY(COALESCE(p_user_work_types, '{}'::text[])))
     AND NOT ('office' = ANY(COALESCE(p_user_work_types, '{}'::text[])))
  THEN RETURN NULL; END IF;

  -- 5. exact municipality + province match (accent-insensitive)
  IF p_job_municipality IS NOT NULL AND p_job_province IS NOT NULL
     AND p_user_municipality IS NOT NULL AND p_user_province IS NOT NULL
     AND lower(unaccent(p_job_municipality)) = lower(unaccent(p_user_municipality))
     AND lower(p_job_province) = lower(p_user_province)
  THEN RETURN 1.0; END IF;

  -- 6. imprecise geocode or missing coordinates
  IF p_job_accuracy_type IN ('state', 'country') THEN RETURN NULL; END IF;
  IF p_job_lat IS NULL OR p_job_lng IS NULL OR p_user_lat IS NULL OR p_user_lng IS NULL THEN
    RETURN NULL;
  END IF;

  -- 7. distance bands (earth_distance gives metres)
  v_distance_km := earth_distance(
    ll_to_earth(p_user_lat, p_user_lng),
    ll_to_earth(p_job_lat, p_job_lng)
  ) / 1000.0;

  IF v_distance_km <= 50  THEN RETURN 1.0; END IF;
  IF v_distance_km <= 150 THEN RETURN 0.5; END IF;
  RETURN 0.0;
END;
$func$;
-- ─── Replace recalculate_matches_for_user ────────────────────────────────────

CREATE OR REPLACE FUNCTION recalculate_matches_for_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_user_values     text[];
  v_values_rated    jsonb;
  v_user_skills     text[];
  v_user_work_types text[];
  v_user_lat        float8;
  v_user_lng        float8;
  v_user_muni       text;
  v_user_province   text;
  v_use_weighted    boolean;

  -- Algorithm weights (sum to 1.0)
  v_w_val   float8 := 0.55; -- Work Values
  v_w_skill float8 := 0.35; -- Skills
  v_w_wt    float8 := 0.05; -- Work Type (Remote/Hybrid/Office)
  v_w_loc   float8 := 0.05; -- Location (Distance/Municipality)
BEGIN
  -- 1. Fetch user profile data
  SELECT "values", values_rated, skills, work_types, lat, lng, municipality, province
  INTO v_user_values, v_values_rated, v_user_skills, v_user_work_types,
       v_user_lat, v_user_lng, v_user_muni, v_user_province
  FROM profiles
  WHERE id = p_user_id;

  -- 2. Clear matches if profile is empty
  IF (
    (v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL)
    AND (v_values_rated IS NULL OR jsonb_array_length(v_values_rated) = 0)
    AND (v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL)
  ) THEN
    DELETE FROM job_matches WHERE user_id = p_user_id;
    RETURN;
  END IF;

  -- 3. Determine if we use the weighted (ranked) value matcher
  v_use_weighted := (
    v_values_rated IS NOT NULL
    AND jsonb_array_length(v_values_rated) > 0
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'rank') IS NOT NULL
    )
  );

  -- 4. Single Unified Match Calculation
  INSERT INTO job_matches (
    user_id, job_id, score, value_score, skill_score, work_type_score, location_score,
    shared_values, shared_skills, updated_at
  )
  WITH
  valid_jobs AS (
    SELECT id, "values" AS job_values, values_rated AS job_rated, skills AS job_skills,
           work_type, lat AS job_lat, lng AS job_lng,
           municipality AS job_muni, province AS job_province,
           geocode_accuracy_type
    FROM jobs
    WHERE ("values" IS NOT NULL AND array_length("values", 1) IS NOT NULL)
       OR (skills IS NOT NULL AND array_length(skills, 1) IS NOT NULL)
  ),

  -- Skill Matching (Common to both paths)
  skill_computed AS (
    SELECT vj.id AS job_id,
      CASE
        WHEN v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL
          OR vj.job_skills IS NULL OR array_length(vj.job_skills, 1) IS NULL THEN NULL
        ELSE LEAST(
          (COALESCE(array_length(shared_arr.v, 1), 0)::float / array_length(v_user_skills, 1)::float)
          + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3), 1.0)
      END AS skill_score,
      COALESCE(shared_arr.v, '{}'::text[]) AS shared_skills
    FROM valid_jobs vj
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT unnest(COALESCE(v_user_skills, '{}'::text[]))
        INTERSECT SELECT unnest(COALESCE(vj.job_skills, '{}'::text[]))
      ) AS v
    ) shared_arr
  ),

  -- Value Matching (Unifies Weighted vs Flat paths)
  user_items AS (
    SELECT elem->>'value' AS val, (elem->>'rank')::int AS rnk
    FROM jsonb_array_elements(COALESCE(v_values_rated, '[]'::jsonb)) AS elem
    WHERE (elem->>'value') IS NOT NULL
  ),
  total_user_items AS (SELECT count(*)::int AS n FROM user_items),
  user_weights AS (
    SELECT ui.val,
           CASE WHEN v_use_weighted THEN rank_weight(ui.rnk, t.n) ELSE 1.0 END AS weight
    FROM user_items ui CROSS JOIN total_user_items t
  ),
  total_user_weight AS (SELECT COALESCE(SUM(weight), 0) AS total_w FROM user_weights),
  job_value_weights AS (
    SELECT vj.id AS job_id, x.val, MIN(x.job_w) AS job_w
    FROM valid_jobs vj
    CROSS JOIN LATERAL (
      SELECT elem->>'value' AS val,
             rank_weight((elem->>'confidence')::int, jsonb_array_length(vj.job_rated)) AS job_w
      FROM jsonb_array_elements(vj.job_rated) AS elem
      WHERE (elem->>'value') IS NOT NULL
    ) x
    WHERE vj.job_rated IS NOT NULL AND jsonb_array_length(vj.job_rated) > 0
    GROUP BY vj.id, x.val
  ),
  value_computed AS (
    SELECT vj.id AS job_id,
      CASE
        WHEN (v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL)
             AND (v_values_rated IS NULL OR jsonb_array_length(v_values_rated) = 0)
             THEN NULL
        WHEN vj.job_values IS NULL OR array_length(vj.job_values, 1) IS NULL THEN NULL
        WHEN tw.total_w = 0 THEN 0.0
        ELSE LEAST(
          (COALESCE(SUM(uw.weight * COALESCE(jvw.job_w, 1.0)) FILTER (WHERE uw.val = ANY(vj.job_values)), 0) / tw.total_w)
          + LEAST(COUNT(*) FILTER (WHERE uw.val = ANY(vj.job_values)) * 0.1, 0.3), 1.0)
      END AS value_score,
      COALESCE(ARRAY(
        SELECT uw2.val FROM user_weights uw2 WHERE uw2.val = ANY(vj.job_values)
      ), '{}'::text[]) AS shared_values
    FROM valid_jobs vj
    CROSS JOIN user_weights uw
    JOIN total_user_weight tw ON true
    LEFT JOIN job_value_weights jvw ON jvw.job_id = vj.id AND jvw.val = uw.val
    GROUP BY vj.id, vj.job_values, tw.total_w
  ),

  -- Final combination
  combined AS (
    SELECT p_user_id AS user_id, vj.id AS job_id,
      vc.value_score, sc.skill_score,
      CASE
        WHEN v_user_work_types IS NULL OR array_length(v_user_work_types, 1) IS NULL THEN 1.0
        WHEN vj.work_type IS NULL THEN NULL
        WHEN vj.work_type = ANY(v_user_work_types) THEN 1.0
        ELSE 0.0
      END AS work_type_score,
      location_score_for_pair(
        v_user_muni, v_user_province, v_user_lat, v_user_lng, v_user_work_types,
        vj.job_muni, vj.job_province, vj.job_lat, vj.job_lng,
        vj.geocode_accuracy_type, vj.work_type
      ) AS location_score,
      vc.shared_values, sc.shared_skills
    FROM valid_jobs vj
    LEFT JOIN value_computed vc ON vc.job_id = vj.id
    LEFT JOIN skill_computed sc ON sc.job_id = vj.id
  ),
  scored AS (
    SELECT user_id, job_id,
      (
        (COALESCE(value_score, 0) * v_w_val
         + COALESCE(skill_score, 0) * v_w_skill
         + COALESCE(work_type_score, 0) * v_w_wt
         + COALESCE(location_score, 0) * v_w_loc)
        / GREATEST(
          (CASE WHEN value_score IS NOT NULL THEN v_w_val ELSE 0 END
           + CASE WHEN skill_score IS NOT NULL THEN v_w_skill ELSE 0 END
           + CASE WHEN work_type_score IS NOT NULL THEN v_w_wt ELSE 0 END
           + CASE WHEN location_score IS NOT NULL THEN v_w_loc ELSE 0 END), 0.000001)
      ) AS score,
      value_score, skill_score, work_type_score, location_score, shared_values, shared_skills
    FROM combined
    CROSS JOIN (SELECT v_w_val, v_w_skill, v_w_wt, v_w_loc) weights
  )
  SELECT user_id, job_id, score, value_score, skill_score, work_type_score, location_score,
         shared_values, shared_skills, now()
  FROM scored WHERE score IS NOT NULL
  ON CONFLICT (user_id, job_id) DO UPDATE SET
    score = EXCLUDED.score, value_score = EXCLUDED.value_score,
    skill_score = EXCLUDED.skill_score, work_type_score = EXCLUDED.work_type_score,
    location_score = EXCLUDED.location_score, shared_values = EXCLUDED.shared_values,
    shared_skills = EXCLUDED.shared_skills, updated_at = EXCLUDED.updated_at;
END;

END;
$func$;
