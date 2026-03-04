-- Automatic job match recalculation via database triggers.
-- When jobs.values or profiles.values changes, the affected matches
-- are recalculated incrementally (only the changed job/user),
-- replacing the expensive O(users × jobs) full recalculation.

-- Match score formula (mirrors lib/match-calculator.ts):
--   overlap = shared_count / user_values_count
--   bonus   = LEAST(shared_count * 0.1, 0.3)
--   score   = LEAST(overlap + bonus, 1.0)

--------------------------------------------------------------------------------
-- Core: recalculate matches for a single job against all users
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_matches_for_job(p_job_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_job_values text[];
  rec RECORD;
  v_shared text[];
  v_shared_count int;
  v_user_count int;
  v_overlap float;
  v_bonus float;
  v_score float;
BEGIN
  SELECT "values" INTO v_job_values FROM jobs WHERE id = p_job_id;

  IF v_job_values IS NULL OR array_length(v_job_values, 1) IS NULL THEN
    DELETE FROM job_matches WHERE job_id = p_job_id;
    RETURN;
  END IF;

  FOR rec IN
    SELECT id, "values" AS user_values
    FROM profiles
    WHERE "values" IS NOT NULL AND array_length("values", 1) IS NOT NULL
  LOOP
    v_shared := ARRAY(
      SELECT unnest(rec.user_values) INTERSECT SELECT unnest(v_job_values)
    );
    v_shared_count := COALESCE(array_length(v_shared, 1), 0);
    v_user_count := COALESCE(array_length(rec.user_values, 1), 0);

    IF v_user_count = 0 THEN CONTINUE; END IF;

    v_overlap := v_shared_count::float / v_user_count::float;
    v_bonus := LEAST(v_shared_count * 0.1, 0.3);
    v_score := LEAST(v_overlap + v_bonus, 1.0);

    INSERT INTO job_matches (user_id, job_id, score, shared_values, updated_at)
    VALUES (rec.id, p_job_id, v_score, v_shared, now())
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET score = EXCLUDED.score,
                  shared_values = EXCLUDED.shared_values,
                  updated_at = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

--------------------------------------------------------------------------------
-- Core: recalculate matches for a single user against all jobs
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_matches_for_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_values text[];
  rec RECORD;
  v_shared text[];
  v_shared_count int;
  v_user_count int;
  v_overlap float;
  v_bonus float;
  v_score float;
BEGIN
  SELECT "values" INTO v_user_values FROM profiles WHERE id = p_user_id;

  IF v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL THEN
    DELETE FROM job_matches WHERE user_id = p_user_id;
    RETURN;
  END IF;

  v_user_count := array_length(v_user_values, 1);

  FOR rec IN
    SELECT id, "values" AS job_values
    FROM jobs
    WHERE "values" IS NOT NULL AND array_length("values", 1) IS NOT NULL
  LOOP
    v_shared := ARRAY(
      SELECT unnest(v_user_values) INTERSECT SELECT unnest(rec.job_values)
    );
    v_shared_count := COALESCE(array_length(v_shared, 1), 0);

    v_overlap := v_shared_count::float / v_user_count::float;
    v_bonus := LEAST(v_shared_count * 0.1, 0.3);
    v_score := LEAST(v_overlap + v_bonus, 1.0);

    INSERT INTO job_matches (user_id, job_id, score, shared_values, updated_at)
    VALUES (p_user_id, rec.id, v_score, v_shared, now())
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET score = EXCLUDED.score,
                  shared_values = EXCLUDED.shared_values,
                  updated_at = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

--------------------------------------------------------------------------------
-- Trigger function: fires when jobs.values changes
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_recalculate_job_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

--------------------------------------------------------------------------------
-- Trigger function: fires when profiles.values changes
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_recalculate_user_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."values" IS NOT NULL AND array_length(NEW."values", 1) IS NOT NULL THEN
      PERFORM recalculate_matches_for_user(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."values" IS DISTINCT FROM NEW."values" THEN
      PERFORM recalculate_matches_for_user(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

--------------------------------------------------------------------------------
-- Attach triggers
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_job_values_changed ON jobs;
CREATE TRIGGER trg_job_values_changed
  AFTER INSERT OR UPDATE OF "values" ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_job_matches();

DROP TRIGGER IF EXISTS trg_profile_values_changed ON profiles;
CREATE TRIGGER trg_profile_values_changed
  AFTER INSERT OR UPDATE OF "values" ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_user_matches();
