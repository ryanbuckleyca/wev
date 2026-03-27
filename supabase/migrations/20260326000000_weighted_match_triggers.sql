-- Update match recalculation functions to support Weighted_Match formula.
-- When a profile has `values_rated` with at least one tier set, the weighted
-- formula is used. Otherwise falls back to the existing Flat_Match formula.
--
-- Weighted_Match formula (mirrors wev-bulletin/lib/match-calculator.ts):
--   tier weights: most_important=1.0, more_important=0.75,
--                 less_important=0.5, least_important=0.25
--   unrated / unknown tier → neutral weight 0.5
--   weighted_overlap = sum(weight for shared values) / sum(weight for all user values)
--   bonus            = LEAST(shared_count * 0.1, 0.3)
--   score            = LEAST(weighted_overlap + bonus, 1.0)
--
-- Flat_Match formula (fallback):
--   overlap = shared_count / user_count
--   bonus   = LEAST(shared_count * 0.1, 0.3)
--   score   = LEAST(overlap + bonus, 1.0)
--
-- Requirements: 3.7, 3.8

--------------------------------------------------------------------------------
-- Helper: compute tier weight from a tier string
-- Returns 1.0 / 0.75 / 0.5 / 0.25 for known tiers, 0.5 for anything else.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION value_tier_weight(p_tier text)
RETURNS float LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tier
    WHEN 'most_important'  THEN 1.0
    WHEN 'more_important'  THEN 0.75
    WHEN 'less_important'  THEN 0.5
    WHEN 'least_important' THEN 0.25
    ELSE 0.5  -- neutral weight for null / unrecognised tier
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

  -- Determine whether the profile has at least one rated entry with a non-null tier
  v_use_weighted := (
    v_values_rated IS NOT NULL
    AND jsonb_array_length(v_values_rated) > 0
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'tier') IS NOT NULL
    )
  );

  IF v_use_weighted THEN
    -- Weighted_Match: use values_rated
    INSERT INTO job_matches (user_id, job_id, score, shared_values, updated_at)
    WITH
    -- Expand values_rated into (value, weight) rows
    user_weights AS (
      SELECT
        elem->>'value'                          AS val,
        value_tier_weight(elem->>'tier')        AS weight
      FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'value') IS NOT NULL
    ),
    -- Total weight denominator for this user
    total_weight AS (
      SELECT COALESCE(SUM(weight), 0) AS w FROM user_weights
    ),
    -- Jobs to match against
    valid_jobs AS (
      SELECT id, "values" AS job_values
      FROM jobs
      WHERE "values" IS NOT NULL AND array_length("values", 1) IS NOT NULL
    ),
    -- For each job, compute weighted overlap numerator and shared count
    computed AS (
      SELECT
        p_user_id                                                   AS user_id,
        vj.id                                                       AS job_id,
        COALESCE(SUM(uw.weight) FILTER (
          WHERE uw.val = ANY(vj.job_values)
        ), 0)                                                       AS overlap_num,
        COUNT(*) FILTER (
          WHERE uw.val = ANY(vj.job_values)
        )::int                                                      AS shared_count,
        (SELECT w FROM total_weight)                                AS total_w,
        ARRAY(
          SELECT uw2.val
          FROM user_weights uw2
          WHERE uw2.val = ANY(vj.job_values)
        )                                                           AS shared_values
      FROM valid_jobs vj
      CROSS JOIN user_weights uw
      GROUP BY vj.id, vj.job_values
    )
    SELECT
      user_id,
      job_id,
      CASE WHEN total_w = 0 THEN 0.0
           ELSE LEAST(
             (overlap_num / total_w)
             + LEAST(shared_count * 0.1, 0.3),
             1.0
           )
      END  AS score,
      shared_values,
      now() AS updated_at
    FROM computed
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET score         = EXCLUDED.score,
                  shared_values = EXCLUDED.shared_values,
                  updated_at    = EXCLUDED.updated_at;

  ELSE
    -- Flat_Match fallback: use plain values array
    IF v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL THEN
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
        vj.id     AS job_id,
        LEAST(
          (COALESCE(array_length(shared.v, 1), 0)::float
            / array_length(v_user_values, 1)::float)
          + LEAST(COALESCE(array_length(shared.v, 1), 0) * 0.1, 0.3),
          1.0
        ) AS score,
        shared.v AS shared_values
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT ARRAY(
          SELECT unnest(v_user_values) INTERSECT SELECT unnest(vj.job_values)
        ) AS v
      ) shared
    )
    SELECT user_id, job_id, score, shared_values, now()
    FROM computed
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET score         = EXCLUDED.score,
                  shared_values = EXCLUDED.shared_values,
                  updated_at    = EXCLUDED.updated_at;
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
BEGIN
  SELECT "values" INTO v_job_values FROM jobs WHERE id = p_job_id;

  IF v_job_values IS NULL OR array_length(v_job_values, 1) IS NULL THEN
    DELETE FROM job_matches WHERE job_id = p_job_id;
    RETURN;
  END IF;

  -- For each profile, decide Weighted_Match vs Flat_Match individually.
  -- We use a single INSERT ... SELECT that branches per profile.
  INSERT INTO job_matches (user_id, job_id, score, shared_values, updated_at)
  WITH
  -- Profiles that have at least one rated value with a non-null tier
  weighted_profiles AS (
    SELECT
      p.id AS profile_id,
      p.values_rated
    FROM profiles p
    WHERE
      p.values_rated IS NOT NULL
      AND jsonb_array_length(p.values_rated) > 0
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p.values_rated) AS elem
        WHERE (elem->>'tier') IS NOT NULL
      )
  ),
  -- Expand weighted profiles into (profile_id, value, weight) rows
  weighted_rows AS (
    SELECT
      wp.profile_id,
      elem->>'value'                   AS val,
      value_tier_weight(elem->>'tier') AS weight
    FROM weighted_profiles wp
    CROSS JOIN jsonb_array_elements(wp.values_rated) AS elem
    WHERE (elem->>'value') IS NOT NULL
  ),
  -- Aggregate per profile: total weight, overlap weight, shared count, shared values
  weighted_computed AS (
    SELECT
      wr.profile_id                                                AS user_id,
      p_job_id                                                     AS job_id,
      SUM(wr.weight)                                               AS total_w,
      COALESCE(SUM(wr.weight) FILTER (
        WHERE wr.val = ANY(v_job_values)
      ), 0)                                                        AS overlap_num,
      COUNT(*) FILTER (
        WHERE wr.val = ANY(v_job_values)
      )::int                                                       AS shared_count,
      ARRAY(
        SELECT DISTINCT wr2.val
        FROM weighted_rows wr2
        WHERE wr2.profile_id = wr.profile_id
          AND wr2.val = ANY(v_job_values)
      )                                                            AS shared_values
    FROM weighted_rows wr
    GROUP BY wr.profile_id
  ),
  -- Flat_Match profiles: have plain values but no (or all-unrated) values_rated
  flat_profiles AS (
    SELECT p.id AS profile_id, p."values" AS user_values
    FROM profiles p
    WHERE
      p."values" IS NOT NULL
      AND array_length(p."values", 1) IS NOT NULL
      AND p.id NOT IN (SELECT profile_id FROM weighted_profiles)
  ),
  flat_computed AS (
    SELECT
      fp.profile_id AS user_id,
      p_job_id      AS job_id,
      LEAST(
        (COALESCE(array_length(shared.v, 1), 0)::float
          / array_length(fp.user_values, 1)::float)
        + LEAST(COALESCE(array_length(shared.v, 1), 0) * 0.1, 0.3),
        1.0
      ) AS score,
      shared.v AS shared_values
    FROM flat_profiles fp
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT unnest(fp.user_values) INTERSECT SELECT unnest(v_job_values)
      ) AS v
    ) shared
    WHERE array_length(fp.user_values, 1) > 0
  ),
  -- Combine both sets
  all_computed AS (
    SELECT
      user_id,
      job_id,
      CASE WHEN total_w = 0 THEN 0.0
           ELSE LEAST(
             (overlap_num / total_w) + LEAST(shared_count * 0.1, 0.3),
             1.0
           )
      END  AS score,
      shared_values
    FROM weighted_computed
    UNION ALL
    SELECT user_id, job_id, score, shared_values
    FROM flat_computed
  )
  SELECT user_id, job_id, score, shared_values, now()
  FROM all_computed
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET score         = EXCLUDED.score,
                shared_values = EXCLUDED.shared_values,
                updated_at    = EXCLUDED.updated_at;
END;
$func$;

--------------------------------------------------------------------------------
-- Trigger function: fires when jobs.values changes
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_recalculate_job_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."values" IS NOT NULL AND array_length(NEW."values", 1) IS NOT NULL THEN
      PERFORM recalculate_matches_for_job(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."values" IS DISTINCT FROM NEW."values" THEN
      PERFORM recalculate_matches_for_job(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$func$;

--------------------------------------------------------------------------------
-- Trigger function: fires when profiles.values OR profiles.values_rated changes
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_recalculate_user_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW."values" IS NOT NULL AND array_length(NEW."values", 1) IS NOT NULL)
       OR (NEW.values_rated IS NOT NULL AND jsonb_array_length(NEW.values_rated) > 0)
    THEN
      PERFORM recalculate_matches_for_user(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."values"      IS DISTINCT FROM NEW."values"
       OR OLD.values_rated IS DISTINCT FROM NEW.values_rated
    THEN
      PERFORM recalculate_matches_for_user(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$func$;

--------------------------------------------------------------------------------
-- Re-attach triggers (drop + recreate to pick up column list changes)
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_job_values_changed ON jobs;
CREATE TRIGGER trg_job_values_changed
  AFTER INSERT OR UPDATE OF "values" ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_job_matches();

DROP TRIGGER IF EXISTS trg_profile_values_changed ON profiles;
CREATE TRIGGER trg_profile_values_changed
  AFTER INSERT OR UPDATE OF "values", values_rated ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_user_matches();
