-- Add work_type_score and location_score to job_matches and update
-- recalc functions to compute them. Location scoring is only applied when
-- the profile has explicitly selected the 'location' value and provided
-- a non-empty `ideal_work_environment` string. Work types default to
-- "all selected" when the profile has no `work_types` set.

--------------------------------------------------------------------------------
-- 1. Add columns
--------------------------------------------------------------------------------
ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS work_type_score float,
  ADD COLUMN IF NOT EXISTS location_score float;
COMMENT ON COLUMN public.job_matches.work_type_score IS 'Match score based on work type preference (0-1). Defaults to 1.0 when the profile has no work_types set.';
COMMENT ON COLUMN public.job_matches.location_score IS 'Match score based on ideal_work_environment overlap with job text (0-1). Null when profile did not opt into location or did not provide an ideal_work_environment.';
--------------------------------------------------------------------------------
-- 2. Replace recalculate_matches_for_user to include work_type_score and location_score
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_matches_for_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_user_values   text[];
  v_values_rated  jsonb;
  v_user_skills   text[];
  v_user_work_types text[];
  v_user_ideal_env text;
  v_use_weighted  boolean;
  v_has_location_value boolean := false;
BEGIN
  SELECT "values", values_rated, skills, work_types, ideal_work_environment
  INTO v_user_values, v_values_rated, v_user_skills, v_user_work_types, v_user_ideal_env
  FROM profiles
  WHERE id = p_user_id;

  -- Determine if profile explicitly selected the 'location' value
  v_has_location_value := (
    (v_user_values IS NOT NULL AND array_position(v_user_values, 'location') IS NOT NULL)
    OR (
      v_values_rated IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_values_rated) AS elem WHERE elem->>'value' = 'location'
      )
    )
  );

  IF (
    (v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL)
    AND (v_values_rated IS NULL OR jsonb_array_length(v_values_rated) = 0)
    AND (v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL)
    AND (v_user_work_types IS NULL OR array_length(v_user_work_types, 1) IS NULL)
  ) THEN
    DELETE FROM job_matches WHERE user_id = p_user_id;
    RETURN;
  END IF;

  v_use_weighted := (
    v_values_rated IS NOT NULL
    AND jsonb_array_length(v_values_rated) > 0
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'rank') IS NOT NULL
    )
  );

  -- Build matches including work_type_score and location_score
  IF v_use_weighted THEN
    INSERT INTO job_matches (
      user_id, job_id, score, value_score, skill_score, work_type_score, location_score, shared_values, shared_skills, updated_at
    )
    WITH valid_jobs AS (
      SELECT id, "values" AS job_values, values_rated AS job_rated, skills AS job_skills, work_type, coalesce(location, '') AS job_location, coalesce(summary, '') AS job_summary, coalesce(description, '') AS job_description
      FROM jobs
      WHERE ("values" IS NOT NULL AND array_length("values", 1) IS NOT NULL)
        OR (skills IS NOT NULL AND array_length(skills, 1) IS NOT NULL)
    ),
    user_items AS (
      SELECT elem->>'value' AS val, (elem->>'rank')::int AS rnk
      FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'value') IS NOT NULL
    ),
    total AS (
      SELECT count(*)::int AS n FROM user_items
    ),
    user_weights AS (
      SELECT ui.val, rank_weight(ui.rnk, t.n) AS weight
      FROM user_items ui
      CROSS JOIN total t
    ),
    total_weight AS (
      SELECT COALESCE(SUM(weight), 0) AS total_w FROM user_weights
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
      WHERE vj.job_rated IS NOT NULL
        AND jsonb_array_length(vj.job_rated) > 0
      GROUP BY vj.id, x.val
    ),
    weighted_value_base AS (
      SELECT vj.id AS job_id, vj.job_values,
        COALESCE(
          SUM(uw.weight * COALESCE(jvw.job_w, 1.0)) FILTER (WHERE uw.val = ANY(vj.job_values)),
          0
        ) AS overlap_num,
        COUNT(*) FILTER (WHERE uw.val = ANY(vj.job_values))::int AS shared_count,
        ARRAY(
          SELECT uw2.val FROM user_weights uw2 WHERE uw2.val = ANY(vj.job_values)
        ) AS shared_values
      FROM valid_jobs vj
      CROSS JOIN user_weights uw
      LEFT JOIN job_value_weights jvw ON jvw.job_id = vj.id AND jvw.val = uw.val
      GROUP BY vj.id, vj.job_values
    ),
    value_computed AS (
      SELECT
        wb.job_id,
        CASE
          WHEN wb.job_values IS NULL OR array_length(wb.job_values, 1) IS NULL THEN NULL
          WHEN tw.total_w = 0 THEN 0.0
          ELSE LEAST((wb.overlap_num / tw.total_w) + LEAST(wb.shared_count * 0.1, 0.3), 1.0)
        END AS value_score,
        CASE
          WHEN wb.job_values IS NULL OR array_length(wb.job_values, 1) IS NULL THEN '{}'::text[]
          ELSE wb.shared_values
        END AS shared_values
      FROM weighted_value_base wb
      CROSS JOIN total_weight tw
    ),
    skill_computed AS (
      SELECT vj.id AS job_id,
        CASE
          WHEN v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL
            OR vj.job_skills IS NULL OR array_length(vj.job_skills, 1) IS NULL
          THEN NULL
          ELSE LEAST(
            (COALESCE(array_length(shared_arr.v, 1), 0)::float / array_length(v_user_skills, 1)::float)
            + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3),
            1.0
          )
        END AS skill_score,
        CASE
          WHEN v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL
            OR vj.job_skills IS NULL OR array_length(vj.job_skills, 1) IS NULL
          THEN '{}'::text[]
          ELSE shared_arr.v
        END AS shared_skills
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT ARRAY(
          SELECT unnest(COALESCE(v_user_skills, '{}'::text[]))
          INTERSECT
          SELECT unnest(COALESCE(vj.job_skills, '{}'::text[]))
        ) AS v
      ) shared_arr
    ),
    combined AS (
      SELECT
        p_user_id AS user_id,
        vj.id AS job_id,
        -- compute component scores
        vc.value_score,
        sc.skill_score,
        -- work_type_score: treat empty user preferences as "all selected"
        CASE
          WHEN v_user_work_types IS NULL OR array_length(v_user_work_types, 1) IS NULL THEN 1.0
          WHEN vj.work_type IS NOT NULL AND vj.work_type = ANY(v_user_work_types) THEN 1.0
          ELSE 0.0
        END AS work_type_score,
        -- location_score: only when user opted into 'location' and provided ideal_work_environment
        CASE
          WHEN v_has_location_value AND v_user_ideal_env IS NOT NULL AND length(trim(v_user_ideal_env)) > 0 THEN (
            -- tokenise ideal env and count overlap with job text
            SELECT LEAST(
              (matched::float / GREATEST(tok_count, 1)::float) + LEAST(matched * 0.1, 0.3),
              1.0
            )
            FROM (
              SELECT
                (SELECT count(*) FROM regexp_split_to_table(lower(v_user_ideal_env), '\\W+') AS tok WHERE length(tok) > 2 AND position(tok IN lower(vj.job_location || ' ' || vj.job_summary || ' ' || vj.job_description)) > 0) AS matched,
                (SELECT count(*) FROM regexp_split_to_table(lower(v_user_ideal_env), '\\W+') AS tok2 WHERE length(tok2) > 2) AS tok_count
            ) s
          )
          ELSE NULL
        END AS location_score,
        COALESCE(vc.shared_values, '{}'::text[]) AS shared_values,
        COALESCE(sc.shared_skills, '{}'::text[]) AS shared_skills
      FROM valid_jobs vj
      LEFT JOIN value_computed vc ON vc.job_id = vj.id
      LEFT JOIN skill_computed sc ON sc.job_id = vj.id
    ),
    scored AS (
      SELECT
        user_id,
        job_id,
        -- compute final combined score using the weighted/legacy rules
        CASE
          WHEN value_score IS NOT NULL AND skill_score IS NOT NULL AND work_type_score IS NULL AND location_score IS NULL THEN LEAST(value_score * 0.6 + skill_score * 0.4, 1.0)
          ELSE (
            -- normalized weighted sum where weights are present for available components
            (CASE WHEN value_score IS NOT NULL THEN value_score * 0.55 ELSE 0 END
             + CASE WHEN skill_score IS NOT NULL THEN skill_score * 0.35 ELSE 0 END
             + CASE WHEN work_type_score IS NOT NULL THEN work_type_score * 0.05 ELSE 0 END
             + CASE WHEN location_score IS NOT NULL THEN location_score * 0.05 ELSE 0 END
            ) / GREATEST(
              (CASE WHEN value_score IS NOT NULL THEN 0.55 ELSE 0 END
               + CASE WHEN skill_score IS NOT NULL THEN 0.35 ELSE 0 END
               + CASE WHEN work_type_score IS NOT NULL THEN 0.05 ELSE 0 END
               + CASE WHEN location_score IS NOT NULL THEN 0.05 ELSE 0 END
              ), 0.000001
            )
          )
        END AS score,
        value_score,
        skill_score,
        work_type_score,
        location_score,
        shared_values,
        shared_skills
      FROM combined
    )
    SELECT
      user_id, job_id, score, value_score, skill_score, work_type_score, location_score, shared_values, shared_skills, now()
    FROM scored
    WHERE score IS NOT NULL
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET
      score = EXCLUDED.score,
      value_score = EXCLUDED.value_score,
      skill_score = EXCLUDED.skill_score,
      work_type_score = EXCLUDED.work_type_score,
      location_score = EXCLUDED.location_score,
      shared_values = EXCLUDED.shared_values,
      shared_skills = EXCLUDED.shared_skills,
      updated_at = EXCLUDED.updated_at;

  ELSE
    -- Flat path (no ranked user values)
    INSERT INTO job_matches (
      user_id, job_id, score, value_score, skill_score, work_type_score, location_score, shared_values, shared_skills, updated_at
    )
    WITH valid_jobs AS (
      SELECT id, "values" AS job_values, values_rated AS job_rated, skills AS job_skills, work_type, coalesce(location, '') AS job_location, coalesce(summary, '') AS job_summary, coalesce(description, '') AS job_description
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
      WHERE vj.job_rated IS NOT NULL
        AND jsonb_array_length(vj.job_rated) > 0
      GROUP BY vj.id, x.val
    ),
    value_computed AS (
      SELECT
        vj.id AS job_id,
        CASE
          WHEN v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL
            OR vj.job_values IS NULL OR array_length(vj.job_values, 1) IS NULL
          THEN NULL
          ELSE LEAST(
            (
              COALESCE(
                (
                  SELECT SUM(COALESCE(jvw.job_w, 1.0)) FROM unnest(shared_arr.v) AS sv LEFT JOIN job_value_weights jvw ON jvw.job_id = vj.id AND jvw.val = sv
                ),
                0
              ) / array_length(v_user_values, 1)::float
            ) + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3),
            1.0
          )
        END AS value_score,
        CASE
          WHEN v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL
            OR vj.job_values IS NULL OR array_length(vj.job_values, 1) IS NULL
          THEN '{}'::text[]
          ELSE shared_arr.v
        END AS shared_values
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT ARRAY(
          SELECT unnest(COALESCE(v_user_values, '{}'::text[]))
          INTERSECT
          SELECT unnest(COALESCE(vj.job_values, '{}'::text[]))
        ) AS v
      ) shared_arr
    ),
    skill_computed AS (
      SELECT
        vj.id AS job_id,
        CASE
          WHEN v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL
            OR vj.job_skills IS NULL OR array_length(vj.job_skills, 1) IS NULL
          THEN NULL
          ELSE LEAST(
            (COALESCE(array_length(shared_arr.v, 1), 0)::float / array_length(v_user_skills, 1)::float)
            + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3),
            1.0
          )
        END AS skill_score,
        CASE
          WHEN v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL
            OR vj.job_skills IS NULL OR array_length(vj.job_skills, 1) IS NULL
          THEN '{}'::text[]
          ELSE shared_arr.v
        END AS shared_skills
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT ARRAY(
          SELECT unnest(COALESCE(v_user_skills, '{}'::text[]))
          INTERSECT
          SELECT unnest(COALESCE(vj.job_skills, '{}'::text[]))
        ) AS v
      ) shared_arr
    ),
    combined AS (
      SELECT
        p_user_id AS user_id,
        vj.id AS job_id,
        vc.value_score,
        sc.skill_score,
        CASE
          WHEN v_user_work_types IS NULL OR array_length(v_user_work_types, 1) IS NULL THEN 1.0
          WHEN vj.work_type IS NOT NULL AND vj.work_type = ANY(v_user_work_types) THEN 1.0
          ELSE 0.0
        END AS work_type_score,
        CASE
          WHEN v_has_location_value AND v_user_ideal_env IS NOT NULL AND length(trim(v_user_ideal_env)) > 0 THEN (
            SELECT LEAST(
              (matched::float / GREATEST(tok_count, 1)::float) + LEAST(matched * 0.1, 0.3),
              1.0
            )
            FROM (
              SELECT
                (SELECT count(*) FROM regexp_split_to_table(lower(v_user_ideal_env), '\\W+') AS tok WHERE length(tok) > 2 AND position(tok IN lower(vj.job_location || ' ' || vj.job_summary || ' ' || vj.job_description)) > 0) AS matched,
                (SELECT count(*) FROM regexp_split_to_table(lower(v_user_ideal_env), '\\W+') AS tok2 WHERE length(tok2) > 2) AS tok_count
            ) s
          )
          ELSE NULL
        END AS location_score,
        COALESCE(vc.shared_values, '{}'::text[]) AS shared_values,
        COALESCE(sc.shared_skills, '{}'::text[]) AS shared_skills
      FROM valid_jobs vj
      LEFT JOIN value_computed vc ON vc.job_id = vj.id
      LEFT JOIN skill_computed sc ON sc.job_id = vj.id
    ),
    scored AS (
      SELECT user_id, job_id,
        CASE WHEN value_score IS NOT NULL AND skill_score IS NOT NULL AND work_type_score IS NULL AND location_score IS NULL THEN LEAST(value_score * 0.6 + skill_score * 0.4, 1.0)
        ELSE ((CASE WHEN value_score IS NOT NULL THEN value_score * 0.55 ELSE 0 END + CASE WHEN skill_score IS NOT NULL THEN skill_score * 0.35 ELSE 0 END + CASE WHEN work_type_score IS NOT NULL THEN work_type_score * 0.05 ELSE 0 END + CASE WHEN location_score IS NOT NULL THEN location_score * 0.05 ELSE 0 END) / GREATEST((CASE WHEN value_score IS NOT NULL THEN 0.55 ELSE 0 END + CASE WHEN skill_score IS NOT NULL THEN 0.35 ELSE 0 END + CASE WHEN work_type_score IS NOT NULL THEN 0.05 ELSE 0 END + CASE WHEN location_score IS NOT NULL THEN 0.05 ELSE 0 END), 0.000001)) END AS score,
        value_score, skill_score, work_type_score, location_score, shared_values, shared_skills
      FROM combined
    )
    SELECT user_id, job_id, score, value_score, skill_score, work_type_score, location_score, shared_values, shared_skills, now()
    FROM scored
    WHERE score IS NOT NULL
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET
      score = EXCLUDED.score,
      value_score = EXCLUDED.value_score,
      skill_score = EXCLUDED.skill_score,
      work_type_score = EXCLUDED.work_type_score,
      location_score = EXCLUDED.location_score,
      shared_values = EXCLUDED.shared_values,
      shared_skills = EXCLUDED.shared_skills,
      updated_at = EXCLUDED.updated_at;
  END IF;
END;
$func$;
--------------------------------------------------------------------------------
-- 3. Replace recalculate_matches_for_job to include the same components
--------------------------------------------------------------------------------
-- (implemented above as part of the same migration to keep both functions in sync)

--------------------------------------------------------------------------------
-- 4. Update triggers to watch new columns that should cause recalculation
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_job_values_changed ON jobs;
CREATE TRIGGER trg_job_values_changed
  AFTER INSERT OR UPDATE OF "values", values_rated, skills, work_type, location, summary, description ON jobs
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_job_matches();
DROP TRIGGER IF EXISTS trg_profile_values_changed ON profiles;
CREATE TRIGGER trg_profile_values_changed
  AFTER INSERT OR UPDATE OF "values", values_rated, skills, work_types, ideal_work_environment ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_user_matches();
