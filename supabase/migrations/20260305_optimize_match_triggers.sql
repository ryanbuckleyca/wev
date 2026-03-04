-- Optimize match recalculation: replace row-by-row loops with set-based
-- INSERT ... SELECT so the planner can optimize. Addresses latency when
-- profiles or jobs tables grow large.

--------------------------------------------------------------------------------
-- Optimized: recalculate matches for a single job (set-based)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_matches_for_job(p_job_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_job_values text[];
BEGIN
  SELECT "values" INTO v_job_values FROM jobs WHERE id = p_job_id;

  IF v_job_values IS NULL OR array_length(v_job_values, 1) IS NULL THEN
    DELETE FROM job_matches WHERE job_id = p_job_id;
    RETURN;
  END IF;

  INSERT INTO job_matches (user_id, job_id, score, shared_values, updated_at)
  WITH valid_profiles AS (
    SELECT id, "values" AS user_values, array_length("values", 1) AS user_count
    FROM profiles
    WHERE "values" IS NOT NULL AND array_length("values", 1) IS NOT NULL
  ),
  computed AS (
    SELECT
      vp.id AS user_id,
      p_job_id AS job_id,
      LEAST(
        (COALESCE(array_length(shared.v, 1), 0)::float / vp.user_count::float)
        + LEAST(COALESCE(array_length(shared.v, 1), 0) * 0.1, 0.3),
        1.0
      ) AS score,
      shared.v AS shared_values
    FROM valid_profiles vp
    CROSS JOIN LATERAL (
      SELECT ARRAY(SELECT unnest(vp.user_values) INTERSECT SELECT unnest(v_job_values)) AS v
    ) shared
    WHERE vp.user_count > 0
  )
  SELECT user_id, job_id, score, shared_values, now()
  FROM computed
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET score = EXCLUDED.score,
                shared_values = EXCLUDED.shared_values,
                updated_at = EXCLUDED.updated_at;
END;
$$;

--------------------------------------------------------------------------------
-- Optimized: recalculate matches for a single user (set-based)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_matches_for_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_values text[];
  v_user_count int;
BEGIN
  SELECT "values", array_length("values", 1) INTO v_user_values, v_user_count
  FROM profiles WHERE id = p_user_id;

  IF v_user_values IS NULL OR v_user_count IS NULL OR v_user_count = 0 THEN
    DELETE FROM job_matches WHERE user_id = p_user_id;
    RETURN;
  END IF;

  INSERT INTO job_matches (user_id, job_id, score, shared_values, updated_at)
  WITH valid_jobs AS (
    SELECT id, "values" AS job_values
    FROM jobs
    WHERE "values" IS NOT NULL AND array_length("values", 1) IS NOT NULL
  ),
  computed AS (
    SELECT
      p_user_id AS user_id,
      vj.id AS job_id,
      LEAST(
        (COALESCE(array_length(shared.v, 1), 0)::float / v_user_count::float)
        + LEAST(COALESCE(array_length(shared.v, 1), 0) * 0.1, 0.3),
        1.0
      ) AS score,
      shared.v AS shared_values
    FROM valid_jobs vj
    CROSS JOIN LATERAL (
      SELECT ARRAY(SELECT unnest(v_user_values) INTERSECT SELECT unnest(vj.job_values)) AS v
    ) shared
  )
  SELECT user_id, job_id, score, shared_values, now()
  FROM computed
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET score = EXCLUDED.score,
                shared_values = EXCLUDED.shared_values,
                updated_at = EXCLUDED.updated_at;
END;
$$;
