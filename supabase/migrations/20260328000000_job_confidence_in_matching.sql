-- Use job values_rated.confidence in match scoring.
--
-- Adds a helper function job_confidence_weight() that maps a job value's
-- confidence position to a weight via rank_weight().  Updates both
-- recalculate_matches_for_user and recalculate_matches_for_job to multiply
-- the overlap contribution of each shared value by its job confidence weight.
--
-- Updated formula:
--
--   Weighted_Match:
--     overlap_num = SUM(user_weight * job_confidence_weight for shared values)
--     total_w     = SUM(user_weight for all user values)
--     score       = LEAST(overlap_num / total_w + LEAST(shared_count * 0.1, 0.3), 1.0)
--
--   Flat_Match:
--     overlap_num = SUM(job_confidence_weight for shared values)
--     user_count  = COUNT(user values)
--     score       = LEAST(overlap_num / user_count + LEAST(shared_count * 0.1, 0.3), 1.0)
--
-- When a job has no values_rated (NULL or empty), job_confidence_weight
-- returns 1.0 — preserving the previous behaviour.

--------------------------------------------------------------------------------
-- Helper: look up job confidence weight for a single value name
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION job_confidence_weight(p_job_rated jsonb, p_value text)
RETURNS float LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_job_rated IS NULL OR jsonb_array_length(p_job_rated) = 0 THEN 1.0
    ELSE COALESCE(
      (
        SELECT rank_weight(
          (elem->>'confidence')::int,
          jsonb_array_length(p_job_rated)
        )
        FROM jsonb_array_elements(p_job_rated) AS elem
        WHERE elem->>'value' = p_value
        LIMIT 1
      ),
      1.0
    )
  END;
$$;

--------------------------------------------------------------------------------
-- Core: recalculate matches for a single user against all jobs
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_matches_for_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_user_values   text[];
  v_values_rated  jsonb;
  v_use_weighted  boolean;
BEGIN
  SELECT "values", values_rated
  INTO v_user_values, v_values_rated
  FROM profiles
  WHERE id = p_user_id;

  v_use_weighted := (
    v_values_rated IS NOT NULL
    AND jsonb_array_length(v_values_rated) > 0
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'rank') IS NOT NULL
    )
  );

  IF v_use_weighted THEN
    INSERT INTO job_matches (user_id, job_id, score, shared_values, updated_at)
    WITH
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
    total_weight AS (SELECT COALESCE(SUM(weight), 0) AS w FROM user_weights),
    valid_jobs AS (
      SELECT id, "values" AS job_values, values_rated AS job_rated
      FROM jobs
      WHERE "values" IS NOT NULL AND array_length("values", 1) IS NOT NULL
    ),
    computed AS (
      SELECT
        p_user_id AS user_id,
        vj.id AS job_id,
        COALESCE(
          SUM(uw.weight * job_confidence_weight(vj.job_rated, uw.val))
            FILTER (WHERE uw.val = ANY(vj.job_values)),
          0
        ) AS overlap_num,
        COUNT(*) FILTER (WHERE uw.val = ANY(vj.job_values))::int AS shared_count,
        (SELECT w FROM total_weight) AS total_w,
        ARRAY(SELECT uw2.val FROM user_weights uw2 WHERE uw2.val = ANY(vj.job_values)) AS shared_values
      FROM valid_jobs vj CROSS JOIN user_weights uw
      GROUP BY vj.id, vj.job_values, vj.job_rated
    )
    SELECT
      user_id, job_id,
      CASE WHEN total_w = 0 THEN 0.0
           ELSE LEAST((overlap_num / total_w) + LEAST(shared_count * 0.1, 0.3), 1.0)
      END AS score,
      shared_values, now()
    FROM computed
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET score = EXCLUDED.score, shared_values = EXCLUDED.shared_values, updated_at = EXCLUDED.updated_at;

  ELSE
    IF v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL THEN
      DELETE FROM job_matches WHERE user_id = p_user_id;
      RETURN;
    END IF;

    INSERT INTO job_matches (user_id, job_id, score, shared_values, updated_at)
    WITH valid_jobs AS (
      SELECT id, "values" AS job_values, values_rated AS job_rated
      FROM jobs
      WHERE "values" IS NOT NULL AND array_length("values", 1) IS NOT NULL
    ),
    computed AS (
      SELECT
        p_user_id AS user_id, vj.id AS job_id,
        shared_arr.v AS shared_values,
        LEAST(
          (COALESCE(
            (SELECT SUM(job_confidence_weight(vj.job_rated, sv))
             FROM unnest(shared_arr.v) AS sv),
            0
          ) / array_length(v_user_values, 1)::float)
          + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3), 1.0
        ) AS score
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT ARRAY(SELECT unnest(v_user_values) INTERSECT SELECT unnest(vj.job_values)) AS v
      ) shared_arr
    )
    SELECT user_id, job_id, score, shared_values, now()
    FROM computed
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET score = EXCLUDED.score, shared_values = EXCLUDED.shared_values, updated_at = EXCLUDED.updated_at;
  END IF;
END;
$func$;

--------------------------------------------------------------------------------
-- Core: recalculate matches for a single job against all users
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_matches_for_job(p_job_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_job_values text[];
  v_job_rated  jsonb;
BEGIN
  SELECT "values", values_rated INTO v_job_values, v_job_rated FROM jobs WHERE id = p_job_id;

  IF v_job_values IS NULL OR array_length(v_job_values, 1) IS NULL THEN
    DELETE FROM job_matches WHERE job_id = p_job_id;
    RETURN;
  END IF;

  INSERT INTO job_matches (user_id, job_id, score, shared_values, updated_at)
  WITH
  weighted_profiles AS (
    SELECT p.id AS profile_id, p.values_rated
    FROM profiles p
    WHERE p.values_rated IS NOT NULL
      AND jsonb_array_length(p.values_rated) > 0
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.values_rated) AS elem
        WHERE (elem->>'rank') IS NOT NULL
      )
  ),
  weighted_items AS (
    SELECT
      wp.profile_id,
      elem->>'value' AS val,
      (elem->>'rank')::int AS rnk,
      (SELECT count(*) FROM jsonb_array_elements(wp.values_rated))::int AS total
    FROM weighted_profiles wp
    CROSS JOIN jsonb_array_elements(wp.values_rated) AS elem
    WHERE (elem->>'value') IS NOT NULL
  ),
  weighted_rows AS (
    SELECT profile_id, val, rank_weight(rnk, total) AS weight
    FROM weighted_items
  ),
  weighted_computed AS (
    SELECT
      wr.profile_id AS user_id,
      p_job_id AS job_id,
      SUM(wr.weight) AS total_w,
      COALESCE(
        SUM(wr.weight * job_confidence_weight(v_job_rated, wr.val))
          FILTER (WHERE wr.val = ANY(v_job_values)),
        0
      ) AS overlap_num,
      COUNT(*) FILTER (WHERE wr.val = ANY(v_job_values))::int AS shared_count,
      ARRAY(
        SELECT DISTINCT wr2.val FROM weighted_rows wr2
        WHERE wr2.profile_id = wr.profile_id AND wr2.val = ANY(v_job_values)
      ) AS shared_values
    FROM weighted_rows wr
    GROUP BY wr.profile_id
  ),
  flat_profiles AS (
    SELECT p.id AS profile_id, p."values" AS user_values
    FROM profiles p
    WHERE p."values" IS NOT NULL
      AND array_length(p."values", 1) IS NOT NULL
      AND p.id NOT IN (SELECT profile_id FROM weighted_profiles)
  ),
  flat_computed AS (
    SELECT
      fp.profile_id AS user_id, p_job_id AS job_id,
      shared_arr.v AS shared_values,
      LEAST(
        (COALESCE(
          (SELECT SUM(job_confidence_weight(v_job_rated, sv))
           FROM unnest(shared_arr.v) AS sv),
          0
        ) / array_length(fp.user_values, 1)::float)
        + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3), 1.0
      ) AS score
    FROM flat_profiles fp
    CROSS JOIN LATERAL (
      SELECT ARRAY(SELECT unnest(fp.user_values) INTERSECT SELECT unnest(v_job_values)) AS v
    ) shared_arr
    WHERE array_length(fp.user_values, 1) > 0
  ),
  all_computed AS (
    SELECT user_id, job_id,
      CASE WHEN total_w = 0 THEN 0.0
           ELSE LEAST((overlap_num / total_w) + LEAST(shared_count * 0.1, 0.3), 1.0)
      END AS score,
      shared_values
    FROM weighted_computed
    UNION ALL
    SELECT user_id, job_id, score, shared_values FROM flat_computed
  )
  SELECT user_id, job_id, score, shared_values, now()
  FROM all_computed
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET score = EXCLUDED.score, shared_values = EXCLUDED.shared_values, updated_at = EXCLUDED.updated_at;
END;
$func$;

--------------------------------------------------------------------------------
-- Trigger: fires when jobs.values OR jobs.values_rated changes
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_recalculate_job_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW."values" IS NOT NULL AND array_length(NEW."values", 1) IS NOT NULL)
       OR (NEW.values_rated IS NOT NULL AND jsonb_array_length(NEW.values_rated) > 0)
    THEN
      PERFORM recalculate_matches_for_job(NEW.id);
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."values" IS DISTINCT FROM NEW."values"
       OR OLD.values_rated IS DISTINCT FROM NEW.values_rated
    THEN
      PERFORM recalculate_matches_for_job(NEW.id);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$func$;

--------------------------------------------------------------------------------
-- Re-attach job trigger to also fire on values_rated changes
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_job_values_changed ON jobs;
CREATE TRIGGER trg_job_values_changed
  AFTER INSERT OR UPDATE OF "values", values_rated ON jobs
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_job_matches();
