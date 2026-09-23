-- Delta on top of 20260922134218 (may already be recorded on prod with an earlier body).
-- Adds profile_skills RLS, restores score-weighted pooling, hardens skills CHECK drop.

-- 1. RLS policies for profile_skills (table may already exist with RLS on and no policies)
ALTER TABLE IF EXISTS profile_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile_skills" ON profile_skills;
CREATE POLICY "Users can read own profile_skills"
  ON profile_skills FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own profile_skills" ON profile_skills;
CREATE POLICY "Users can insert own profile_skills"
  ON profile_skills FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile_skills" ON profile_skills;
CREATE POLICY "Users can update own profile_skills"
  ON profile_skills FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own profile_skills" ON profile_skills;
CREATE POLICY "Users can delete own profile_skills"
  ON profile_skills FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON profile_skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_skills TO service_role;

-- 2. Ensure 50-skill ceiling (named drop + definition scan)
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_skills_max_10_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_skills_max_10_check;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'c'
      AND (
        (conrelid = 'jobs'::regclass AND pg_get_constraintdef(oid) ILIKE '%array_length(skills%<=%10%')
        OR (conrelid = 'profiles'::regclass AND pg_get_constraintdef(oid) ILIKE '%array_length(skills%<=%10%')
      )
  ) LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_skills_max_50_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_skills_max_50_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_skills_max_50_check
  CHECK (array_length(skills, 1) IS NULL OR array_length(skills, 1) <= 50) NOT VALID;
ALTER TABLE profiles ADD CONSTRAINT profiles_skills_max_50_check
  CHECK (array_length(skills, 1) IS NULL OR array_length(skills, 1) <= 50) NOT VALID;

-- 3. Score-weighted mean via unnest (avoids vector * float)
CREATE OR REPLACE FUNCTION compute_job_skill_embedding(p_job_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_embedding vector(1024);
BEGIN
  SELECT (
    SELECT array_agg(dim ORDER BY ord)::vector
    FROM (
      SELECT u.ord,
             SUM(js.score * u.dim) / NULLIF(SUM(js.score), 0) AS dim
      FROM job_skills js
      JOIN esco_skills es ON es.concept_uri = js.skill_id
      CROSS JOIN LATERAL unnest(
        string_to_array(trim(both '[]' FROM es.embedding::text), ',')::real[]
      ) WITH ORDINALITY AS u(dim, ord)
      WHERE js.job_id = p_job_id AND es.embedding IS NOT NULL
      GROUP BY u.ord
    ) s
  ) INTO v_embedding;

  UPDATE jobs SET skill_embedding = v_embedding WHERE id = p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION compute_profile_skill_embedding(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_embedding vector(1024);
BEGIN
  SELECT (
    SELECT array_agg(dim ORDER BY ord)::vector
    FROM (
      SELECT u.ord,
             SUM(ps.score * u.dim) / NULLIF(SUM(ps.score), 0) AS dim
      FROM profile_skills ps
      JOIN esco_skills es ON es.concept_uri = ps.skill_id
      CROSS JOIN LATERAL unnest(
        string_to_array(trim(both '[]' FROM es.embedding::text), ',')::real[]
      ) WITH ORDINALITY AS u(dim, ord)
      WHERE ps.user_id = p_user_id AND es.embedding IS NOT NULL
      GROUP BY u.ord
    ) s
  ) INTO v_embedding;

  UPDATE profiles SET skill_embedding = v_embedding WHERE id = p_user_id;
END;
$$;

-- 4. Backfill pooled fingerprints (idempotent).
-- Covers prod where 20260922134218 may already be recorded without a backfill,
-- leaving skill_embedding NULL and silently disabling matcher v2 skill scores.
SELECT compute_profile_skill_embedding(user_id)
FROM (SELECT DISTINCT user_id FROM profile_skills) t;

SELECT compute_job_skill_embedding(job_id)
FROM (SELECT DISTINCT job_id FROM job_skills) t;
