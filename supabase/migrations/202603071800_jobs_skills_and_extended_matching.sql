-- Add skills support to jobs and extend matching system for separate skill/value scoring.
-- Part 1: Add jobs.skills column with max constraint
-- Part 2: Extend job_matches table with separate scoring columns
-- Part 3: Update matching functions to calculate both value and skill scores

--------------------------------------------------------------------------------
-- Part 1: Add jobs.skills column (ESCO concept URIs, max 10)
--------------------------------------------------------------------------------
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.jobs.skills IS 'ESCO skill concept URIs tagged to this job (max 10).';

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_skills_max_10_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_skills_max_10_check
  CHECK (coalesce(array_length(skills, 1), 0) <= 10);

--------------------------------------------------------------------------------
-- Part 2: Extend job_matches with separate value/skill scoring
--------------------------------------------------------------------------------
ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS value_score float,
  ADD COLUMN IF NOT EXISTS skill_score float,
  ADD COLUMN IF NOT EXISTS shared_skills text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.job_matches.value_score IS 'Match score based on shared values (0-1, null if no values present).';
COMMENT ON COLUMN public.job_matches.skill_score IS 'Match score based on shared skills (0-1, null if no skills present).';
COMMENT ON COLUMN public.job_matches.shared_skills IS 'ESCO concept URIs shared between user and job.';

-- Migrate existing data: move current score to value_score
UPDATE public.job_matches
SET value_score = score
WHERE value_score IS NULL;

-- Update score constraint to allow nullable during migration
ALTER TABLE public.job_matches
  DROP CONSTRAINT IF EXISTS job_matches_score_check;

ALTER TABLE public.job_matches
  ALTER COLUMN score DROP NOT NULL;

--------------------------------------------------------------------------------
-- Part 3: Drop old matching functions (will be replaced)
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_job_values_changed ON jobs;
DROP TRIGGER IF EXISTS trg_profile_values_changed ON profiles;

DROP FUNCTION IF EXISTS public.recalculate_matches_for_job(UUID);
DROP FUNCTION IF EXISTS public.recalculate_matches_for_user(UUID);
DROP FUNCTION IF EXISTS public.trigger_recalculate_job_matches();
DROP FUNCTION IF EXISTS public.trigger_recalculate_user_matches();

--------------------------------------------------------------------------------
-- Part 4: New matching function for a single job (values + skills)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_matches_for_job(p_job_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_job_values text[];
  v_job_skills text[];
  rec RECORD;
  v_shared_values text[];
  v_shared_skills text[];
  v_shared_values_count int;
  v_shared_skills_count int;
  v_user_values_count int;
  v_user_skills_count int;
  v_value_overlap float;
  v_skill_overlap float;
  v_value_bonus float;
  v_skill_bonus float;
  v_value_score float;
  v_skill_score float;
  v_combined_score float;
  v_has_values boolean;
  v_has_skills boolean;
BEGIN
  SELECT "values", skills INTO v_job_values, v_job_skills FROM jobs WHERE id = p_job_id;

  v_has_values := v_job_values IS NOT NULL AND array_length(v_job_values, 1) IS NOT NULL;
  v_has_skills := v_job_skills IS NOT NULL AND array_length(v_job_skills, 1) IS NOT NULL;

  -- If job has neither values nor skills, delete all matches
  IF NOT v_has_values AND NOT v_has_skills THEN
    DELETE FROM job_matches WHERE job_id = p_job_id;
    RETURN;
  END IF;

  FOR rec IN
    SELECT id, "values" AS user_values, skills AS user_skills
    FROM profiles
  LOOP
    v_shared_values := '{}'::text[];
    v_shared_skills := '{}'::text[];
    v_value_score := NULL;
    v_skill_score := NULL;

    -- Calculate value score if both have values
    IF v_has_values AND rec.user_values IS NOT NULL AND array_length(rec.user_values, 1) IS NOT NULL THEN
      v_shared_values := ARRAY(
        SELECT unnest(rec.user_values) INTERSECT SELECT unnest(v_job_values)
      );
      v_shared_values_count := COALESCE(array_length(v_shared_values, 1), 0);
      v_user_values_count := COALESCE(array_length(rec.user_values, 1), 0);

      IF v_user_values_count > 0 THEN
        v_value_overlap := v_shared_values_count::float / v_user_values_count::float;
        v_value_bonus := LEAST(v_shared_values_count * 0.1, 0.3);
        v_value_score := LEAST(v_value_overlap + v_value_bonus, 1.0);
      END IF;
    END IF;

    -- Calculate skill score if both have skills
    IF v_has_skills AND rec.user_skills IS NOT NULL AND array_length(rec.user_skills, 1) IS NOT NULL THEN
      v_shared_skills := ARRAY(
        SELECT unnest(rec.user_skills) INTERSECT SELECT unnest(v_job_skills)
      );
      v_shared_skills_count := COALESCE(array_length(v_shared_skills, 1), 0);
      v_user_skills_count := COALESCE(array_length(rec.user_skills, 1), 0);

      IF v_user_skills_count > 0 THEN
        v_skill_overlap := v_shared_skills_count::float / v_user_skills_count::float;
        v_skill_bonus := LEAST(v_shared_skills_count * 0.1, 0.3);
        v_skill_score := LEAST(v_skill_overlap + v_skill_bonus, 1.0);
      END IF;
    END IF;

    -- Calculate combined score (weighted blend or single signal)
    IF v_value_score IS NOT NULL AND v_skill_score IS NOT NULL THEN
      -- Both signals: 60% values, 40% skills
      v_combined_score := (v_value_score * 0.6) + (v_skill_score * 0.4);
    ELSIF v_value_score IS NOT NULL THEN
      -- Only values
      v_combined_score := v_value_score;
    ELSIF v_skill_score IS NOT NULL THEN
      -- Only skills
      v_combined_score := v_skill_score;
    ELSE
      -- No match possible
      CONTINUE;
    END IF;

    INSERT INTO job_matches (user_id, job_id, score, value_score, skill_score, shared_values, shared_skills, updated_at)
    VALUES (rec.id, p_job_id, v_combined_score, v_value_score, v_skill_score, v_shared_values, v_shared_skills, now())
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET 
      score = EXCLUDED.score,
      value_score = EXCLUDED.value_score,
      skill_score = EXCLUDED.skill_score,
      shared_values = EXCLUDED.shared_values,
      shared_skills = EXCLUDED.shared_skills,
      updated_at = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

--------------------------------------------------------------------------------
-- Part 5: New matching function for a single user (values + skills)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_matches_for_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_values text[];
  v_user_skills text[];
  rec RECORD;
  v_shared_values text[];
  v_shared_skills text[];
  v_shared_values_count int;
  v_shared_skills_count int;
  v_user_values_count int;
  v_user_skills_count int;
  v_value_overlap float;
  v_skill_overlap float;
  v_value_bonus float;
  v_skill_bonus float;
  v_value_score float;
  v_skill_score float;
  v_combined_score float;
  v_has_user_values boolean;
  v_has_user_skills boolean;
BEGIN
  SELECT "values", skills INTO v_user_values, v_user_skills FROM profiles WHERE id = p_user_id;

  v_has_user_values := v_user_values IS NOT NULL AND array_length(v_user_values, 1) IS NOT NULL;
  v_has_user_skills := v_user_skills IS NOT NULL AND array_length(v_user_skills, 1) IS NOT NULL;

  -- If user has neither values nor skills, delete all matches
  IF NOT v_has_user_values AND NOT v_has_user_skills THEN
    DELETE FROM job_matches WHERE user_id = p_user_id;
    RETURN;
  END IF;

  v_user_values_count := COALESCE(array_length(v_user_values, 1), 0);
  v_user_skills_count := COALESCE(array_length(v_user_skills, 1), 0);

  FOR rec IN
    SELECT id, "values" AS job_values, skills AS job_skills
    FROM jobs
  LOOP
    v_shared_values := '{}'::text[];
    v_shared_skills := '{}'::text[];
    v_value_score := NULL;
    v_skill_score := NULL;

    -- Calculate value score if both have values
    IF v_has_user_values AND rec.job_values IS NOT NULL AND array_length(rec.job_values, 1) IS NOT NULL THEN
      v_shared_values := ARRAY(
        SELECT unnest(v_user_values) INTERSECT SELECT unnest(rec.job_values)
      );
      v_shared_values_count := COALESCE(array_length(v_shared_values, 1), 0);

      IF v_user_values_count > 0 THEN
        v_value_overlap := v_shared_values_count::float / v_user_values_count::float;
        v_value_bonus := LEAST(v_shared_values_count * 0.1, 0.3);
        v_value_score := LEAST(v_value_overlap + v_value_bonus, 1.0);
      END IF;
    END IF;

    -- Calculate skill score if both have skills
    IF v_has_user_skills AND rec.job_skills IS NOT NULL AND array_length(rec.job_skills, 1) IS NOT NULL THEN
      v_shared_skills := ARRAY(
        SELECT unnest(v_user_skills) INTERSECT SELECT unnest(rec.job_skills)
      );
      v_shared_skills_count := COALESCE(array_length(v_shared_skills, 1), 0);

      IF v_user_skills_count > 0 THEN
        v_skill_overlap := v_shared_skills_count::float / v_user_skills_count::float;
        v_skill_bonus := LEAST(v_shared_skills_count * 0.1, 0.3);
        v_skill_score := LEAST(v_skill_overlap + v_skill_bonus, 1.0);
      END IF;
    END IF;

    -- Calculate combined score (weighted blend or single signal)
    IF v_value_score IS NOT NULL AND v_skill_score IS NOT NULL THEN
      -- Both signals: 60% values, 40% skills
      v_combined_score := (v_value_score * 0.6) + (v_skill_score * 0.4);
    ELSIF v_value_score IS NOT NULL THEN
      -- Only values
      v_combined_score := v_value_score;
    ELSIF v_skill_score IS NOT NULL THEN
      -- Only skills
      v_combined_score := v_skill_score;
    ELSE
      -- No match possible
      CONTINUE;
    END IF;

    INSERT INTO job_matches (user_id, job_id, score, value_score, skill_score, shared_values, shared_skills, updated_at)
    VALUES (p_user_id, rec.id, v_combined_score, v_value_score, v_skill_score, v_shared_values, v_shared_skills, now())
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET 
      score = EXCLUDED.score,
      value_score = EXCLUDED.value_score,
      skill_score = EXCLUDED.skill_score,
      shared_values = EXCLUDED.shared_values,
      shared_skills = EXCLUDED.shared_skills,
      updated_at = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

--------------------------------------------------------------------------------
-- Part 6: Trigger function for jobs (fires on values OR skills change)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_recalculate_job_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW."values" IS NOT NULL AND array_length(NEW."values", 1) IS NOT NULL)
       OR (NEW.skills IS NOT NULL AND array_length(NEW.skills, 1) IS NOT NULL) THEN
      PERFORM recalculate_matches_for_job(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."values" IS DISTINCT FROM NEW."values" OR OLD.skills IS DISTINCT FROM NEW.skills THEN
      PERFORM recalculate_matches_for_job(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

--------------------------------------------------------------------------------
-- Part 7: Trigger function for profiles (fires on values OR skills change)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_recalculate_user_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW."values" IS NOT NULL AND array_length(NEW."values", 1) IS NOT NULL)
       OR (NEW.skills IS NOT NULL AND array_length(NEW.skills, 1) IS NOT NULL) THEN
      PERFORM recalculate_matches_for_user(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."values" IS DISTINCT FROM NEW."values" OR OLD.skills IS DISTINCT FROM NEW.skills THEN
      PERFORM recalculate_matches_for_user(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

--------------------------------------------------------------------------------
-- Part 8: Attach triggers (UPDATE OF now includes both values and skills)
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_job_values_changed ON jobs;
CREATE TRIGGER trg_job_values_changed
  AFTER INSERT OR UPDATE OF "values", skills ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_job_matches();

DROP TRIGGER IF EXISTS trg_profile_values_changed ON profiles;
CREATE TRIGGER trg_profile_values_changed
  AFTER INSERT OR UPDATE OF "values", skills ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_user_matches();
