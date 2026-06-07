-- Upgrade recalculate_matches_for_user to support semantic skill matching via Jina embeddings.
-- 
-- The skill_score calculation now incorporates vector similarity:
-- 1. Exact matches (URI intersection) — Weight: 1.0 (Highest priority)
-- 2. Semantic matches (Similarity threshold > 0.85) — Weight: 0.0-1.0 proportional to similarity
-- 
-- This ensures that "Project Management" matches "Project Planning" even if URIs differ.

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
BEGIN
  -- 1. Fetch user profile data
  SELECT "values", values_rated, skills, work_types, lat, lng, municipality, province
  INTO v_user_values, v_values_rated, v_user_skills, v_user_work_types,
       v_user_lat, v_user_lng, v_user_muni, v_user_province
  FROM profiles
  WHERE id = p_user_id;

  -- 2. Fast exit if no matching criteria
  IF (
    (v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL)
    AND (v_values_rated IS NULL OR jsonb_array_length(v_values_rated) = 0)
    AND (v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL)
  ) THEN
    DELETE FROM job_matches WHERE user_id = p_user_id;
    RETURN;
  END IF;

  -- 3. Determine if we use ranked value matching
  v_use_weighted := (
    v_values_rated IS NOT NULL
    AND jsonb_array_length(v_values_rated) > 0
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'rank') IS NOT NULL
    )
  );

  -- 4. Calculate Semantic Scores (Skills)
  DROP TABLE IF EXISTS _temp_skill_scores;
  CREATE TEMPORARY TABLE _temp_skill_scores ON COMMIT DROP AS
  WITH user_embs AS (
    SELECT concept_uri, embedding
    FROM esco_skills
    WHERE concept_uri = ANY(v_user_skills) AND embedding IS NOT NULL
  ),
  job_skills_expanded AS (
    SELECT j.id AS job_id, unnest(j.skills) AS skill_uri
    FROM jobs j
    WHERE j.skills IS NOT NULL AND array_length(j.skills, 1) > 0
  ),
  job_embs AS (
    SELECT jse.job_id, s.concept_uri, s.embedding
    FROM job_skills_expanded jse
    JOIN esco_skills s ON s.concept_uri = jse.skill_uri
    WHERE s.embedding IS NOT NULL
  ),
  similarities AS (
    SELECT je.job_id, ue.concept_uri AS user_skill_uri,
           MAX(1 - (ue.embedding <=> je.embedding)) AS max_sim
    FROM user_embs ue
    CROSS JOIN job_embs je
    GROUP BY je.job_id, ue.concept_uri
  ),
  semantic_results AS (
    SELECT job_id,
           SUM(CASE WHEN max_sim > 0.85 THEN max_sim ELSE 0 END) / GREATEST(array_length(v_user_skills, 1), 1) AS semantic_score,
           ARRAY(SELECT DISTINCT user_skill_uri FROM similarities s2 WHERE s2.job_id = similarities.job_id AND s2.max_sim > 0.85) AS semantic_shared
    FROM similarities
    GROUP BY job_id
  ),
  exact_results AS (
    SELECT j.id AS job_id,
           (COALESCE(array_length(shared_arr.v, 1), 0)::float / GREATEST(array_length(v_user_skills, 1), 1)) AS exact_score,
           shared_arr.v AS exact_shared
    FROM jobs j
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT unnest(COALESCE(v_user_skills, '{}'::text[]))
        INTERSECT SELECT unnest(COALESCE(j.skills, '{}'::text[]))
      ) AS v
    ) shared_arr
  )
  SELECT j.id AS job_id,
         LEAST(GREATEST(er.exact_score, COALESCE(sr.semantic_score, 0)) + LEAST(COALESCE(array_length(er.exact_shared, 1), 0) * 0.1, 0.3), 1.0) AS skill_score,
         (
           SELECT ARRAY(SELECT DISTINCT x FROM unnest(er.exact_shared || COALESCE(sr.semantic_shared, '{}'::text[])) x)
         ) AS shared_skills
  FROM jobs j
  LEFT JOIN exact_results er ON er.job_id = j.id
  LEFT JOIN semantic_results sr ON sr.job_id = j.id;

  -- 6. Execute Matching Loop
  IF v_use_weighted THEN
    -- Ranked Value Path (Omitted for brevity in this snippet but assumed to combine with skill_score)
    INSERT INTO job_matches (
      user_id, job_id, score, value_score, skill_score, work_type_score, location_score,
      shared_values, shared_skills, updated_at
    )
    WITH valid_jobs AS (
      SELECT id, "values" AS job_values, values_rated AS job_rated, skills AS job_skills,
             work_type, lat AS job_lat, lng AS job_lng,
             municipality AS job_muni, province AS job_province,
             geocode_accuracy_type
      FROM jobs
      WHERE ("values" IS NOT NULL AND array_length("values", 1) IS NOT NULL)
         OR (skills IS NOT NULL AND array_length(skills, 1) IS NOT NULL)
    ),
    user_items AS (
      SELECT elem->>'value' AS val, (elem->>'rank')::int AS rnk
      FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'value') IS NOT NULL
    ),
    total AS (SELECT count(*)::int AS n FROM user_items),
    user_weights AS (
      SELECT ui.val, rank_weight(ui.rnk, t.n) AS weight
      FROM user_items ui CROSS JOIN total t
    ),
    total_weight AS (SELECT COALESCE(SUM(weight), 0) AS total_w FROM user_weights),
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
    weighted_value_base AS (
      SELECT vj.id AS job_id, vj.job_values,
        COALESCE(SUM(uw.weight * COALESCE(jvw.job_w, 1.0)) FILTER (WHERE uw.val = ANY(vj.job_values)), 0) AS overlap_num,
        COUNT(*) FILTER (WHERE uw.val = ANY(vj.job_values))::int AS shared_count,
        ARRAY(SELECT uw2.val FROM user_weights uw2 WHERE uw2.val = ANY(vj.job_values)) AS shared_values
      FROM valid_jobs vj
      CROSS JOIN user_weights uw
      LEFT JOIN job_value_weights jvw ON jvw.job_id = vj.id AND jvw.val = uw.val
      GROUP BY vj.id, vj.job_values
    ),
    value_computed AS (
      SELECT wb.job_id,
        CASE
          WHEN wb.job_values IS NULL OR array_length(wb.job_values, 1) IS NULL THEN NULL
          WHEN tw.total_w = 0 THEN 0.0
          ELSE LEAST((wb.overlap_num / tw.total_w) + LEAST(wb.shared_count * 0.1, 0.3), 1.0)
        END AS value_score,
        COALESCE(wb.shared_values, '{}'::text[]) AS shared_values
      FROM weighted_value_base wb CROSS JOIN total_weight tw
    ),
    combined AS (
      SELECT p_user_id AS user_id, vj.id AS job_id,
        vc.value_score, ts.skill_score,
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
        vc.shared_values,
        ts.shared_skills
      FROM valid_jobs vj
      LEFT JOIN value_computed vc ON vc.job_id = vj.id
      LEFT JOIN _temp_skill_scores ts ON ts.job_id = vj.id
    ),
    scored AS (
      SELECT user_id, job_id,
        (
          (CASE WHEN value_score IS NOT NULL THEN value_score * 0.55 ELSE 0 END
           + CASE WHEN skill_score IS NOT NULL THEN skill_score * 0.35 ELSE 0 END
           + CASE WHEN work_type_score IS NOT NULL THEN work_type_score * 0.05 ELSE 0 END
           + CASE WHEN location_score IS NOT NULL THEN location_score * 0.05 ELSE 0 END)
          / GREATEST(
            (CASE WHEN value_score IS NOT NULL THEN 0.55 ELSE 0 END
             + CASE WHEN skill_score IS NOT NULL THEN 0.35 ELSE 0 END
             + CASE WHEN work_type_score IS NOT NULL THEN 0.05 ELSE 0 END
             + CASE WHEN location_score IS NOT NULL THEN 0.05 ELSE 0 END), 0.000001)
        ) AS score,
        value_score, skill_score, work_type_score, location_score, shared_values, shared_skills
      FROM combined
    )
    SELECT user_id, job_id, score, value_score, skill_score, work_type_score, location_score,
           shared_values, shared_skills, now()
    FROM scored WHERE score IS NOT NULL
    ON CONFLICT (user_id, job_id) DO UPDATE SET
      score = EXCLUDED.score, value_score = EXCLUDED.value_score,
      skill_score = EXCLUDED.skill_score, work_type_score = EXCLUDED.work_type_score,
      location_score = EXCLUDED.location_score, shared_values = EXCLUDED.shared_values,
      shared_skills = EXCLUDED.shared_skills, updated_at = EXCLUDED.updated_at;

  ELSE
    -- Flat path
    INSERT INTO job_matches (
      user_id, job_id, score, value_score, skill_score, work_type_score, location_score,
      shared_values, shared_skills, updated_at
    )
    WITH valid_jobs AS (
      SELECT id, "values" AS job_values, values_rated AS job_rated, skills AS job_skills,
             work_type, lat AS job_lat, lng AS job_lng,
             municipality AS job_muni, province AS job_province,
             geocode_accuracy_type
      FROM jobs
      WHERE ("values" IS NOT NULL AND array_length("values", 1) IS NOT NULL)
         OR (skills IS NOT NULL AND array_length(skills, 1) IS NOT NULL)
    ),
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
          WHEN v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL
            OR vj.job_values IS NULL OR array_length(vj.job_values, 1) IS NULL THEN NULL
          ELSE LEAST(
            (COALESCE((
              SELECT SUM(COALESCE(jvw.job_w, 1.0))
              FROM unnest(shared_arr.v) AS sv
              LEFT JOIN job_value_weights jvw ON jvw.job_id = vj.id AND jvw.val = sv
            ), 0) / array_length(v_user_values, 1)::float)
            + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3), 1.0)
        END AS value_score,
        shared_arr.v AS shared_values
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT ARRAY(
          SELECT unnest(COALESCE(v_user_values, '{}'::text[]))
          INTERSECT SELECT unnest(COALESCE(vj.job_values, '{}'::text[]))
        ) AS v
      ) shared_arr
    ),
    combined AS (
      SELECT p_user_id AS user_id, vj.id AS job_id,
        vc.value_score, ts.skill_score,
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
        COALESCE(vc.shared_values, '{}'::text[]) AS shared_values,
        COALESCE(ts.shared_skills, '{}'::text[]) AS shared_skills
      FROM valid_jobs vj
      LEFT JOIN value_computed vc ON vc.job_id = vj.id
      LEFT JOIN _temp_skill_scores ts ON ts.job_id = vj.id
    ),
    scored AS (
      SELECT user_id, job_id,
        (
          (CASE WHEN value_score IS NOT NULL THEN value_score * 0.55 ELSE 0 END
           + CASE WHEN skill_score IS NOT NULL THEN skill_score * 0.35 ELSE 0 END
           + CASE WHEN work_type_score IS NOT NULL THEN work_type_score * 0.05 ELSE 0 END
           + CASE WHEN location_score IS NOT NULL THEN location_score * 0.05 ELSE 0 END)
          / GREATEST(
            (CASE WHEN value_score IS NOT NULL THEN 0.55 ELSE 0 END
             + CASE WHEN skill_score IS NOT NULL THEN 0.35 ELSE 0 END
             + CASE WHEN work_type_score IS NOT NULL THEN 0.05 ELSE 0 END
             + CASE WHEN location_score IS NOT NULL THEN 0.05 ELSE 0 END), 0.000001)
        ) AS score,
        value_score, skill_score, work_type_score, location_score, shared_values, shared_skills
      FROM combined
    )
    SELECT user_id, job_id, score, value_score, skill_score, work_type_score, location_score,
           shared_values, shared_skills, now()
    FROM scored WHERE score IS NOT NULL
    ON CONFLICT (user_id, job_id) DO UPDATE SET
      score = EXCLUDED.score, value_score = EXCLUDED.value_score,
      skill_score = EXCLUDED.skill_score, work_type_score = EXCLUDED.work_type_score,
      location_score = EXCLUDED.location_score, shared_values = EXCLUDED.shared_values,
      shared_skills = EXCLUDED.shared_skills, updated_at = EXCLUDED.updated_at;
  END IF;
END;
$func$;

-- And the job version
CREATE OR REPLACE FUNCTION recalculate_matches_for_job(p_job_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  -- We just reuse the recalculate_matches_for_user logic by iterating over relevant users.
  -- This is slightly inefficient but ensures consistency.
  PERFORM recalculate_matches_for_user(p.id)
  FROM profiles p
  WHERE p."values" IS NOT NULL OR p.skills IS NOT NULL;
END;
$func$;
