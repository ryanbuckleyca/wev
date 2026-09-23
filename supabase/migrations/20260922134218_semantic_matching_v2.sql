-- Semantic matching v2: profile_skills junction, pooled skill_embedding fingerprints,
-- raise skills array sanity ceiling 10 → 50, and auto-pool triggers.
--
-- Idempotent: safe if partially applied earlier via ad-hoc prod scripts.

-- 1. profile_skills junction (mirrors job_skills)
CREATE TABLE IF NOT EXISTS profile_skills (
    user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    skill_id   text        NOT NULL REFERENCES esco_skills(concept_uri),
    score      float       NOT NULL,
    source     text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, skill_id)
);

ALTER TABLE profile_skills ENABLE ROW LEVEL SECURITY;

-- Own-row CRUD for authenticated users; public has no access (PII via user_id).
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

COMMENT ON TABLE profile_skills IS
  'ESCO skill tags per profile (user_id, skill_id, score, source). '
  'Own-row RLS for authenticated; service_role for pipelines.';

-- 2. Pooled skill fingerprints for 2-stage candidate generation
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skill_embedding vector(1024);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skill_embedding vector(1024);

-- HNSW indexes are created CONCURRENTLY in
-- 20260923151000_skill_embedding_hnsw_concurrently.sql (cannot run inside a txn).

-- 3. Raise CHECK ceilings 10 → 50 (drop by known names AND by definition match)
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

-- NOT VALID: enforce on new writes without validating all existing rows under a long lock.
-- Validated in 20260923152000_validate_skills_max_50_checks.sql.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_skills_max_50_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_skills_max_50_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_skills_max_50_check
  CHECK (array_length(skills, 1) IS NULL OR array_length(skills, 1) <= 50) NOT VALID;
ALTER TABLE profiles ADD CONSTRAINT profiles_skills_max_50_check
  CHECK (array_length(skills, 1) IS NULL OR array_length(skills, 1) <= 50) NOT VALID;

-- 4. Score-weighted mean of member skill embeddings (unnest avoids vector*float issues)
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

-- 5. Recompute embeddings when junction rows change (before legacy migrate/backfill)
CREATE OR REPLACE FUNCTION trg_job_skills_update_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM compute_job_skill_embedding(OLD.job_id);
  ELSE
    PERFORM compute_job_skill_embedding(NEW.job_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_skills_update_embedding ON job_skills;
CREATE TRIGGER trg_job_skills_update_embedding
AFTER INSERT OR UPDATE OR DELETE ON job_skills
FOR EACH ROW
EXECUTE FUNCTION trg_job_skills_update_embedding();

CREATE OR REPLACE FUNCTION trg_profile_skills_update_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM compute_profile_skill_embedding(OLD.user_id);
  ELSE
    PERFORM compute_profile_skill_embedding(NEW.user_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_skills_update_embedding ON profile_skills;
CREATE TRIGGER trg_profile_skills_update_embedding
AFTER INSERT OR UPDATE OR DELETE ON profile_skills
FOR EACH ROW
EXECUTE FUNCTION trg_profile_skills_update_embedding();

-- 6. Migrate existing profiles.skills into profile_skills (score 1.0, source legacy)
-- Triggers fire per row; explicit backfill below covers jobs + any missed profiles.
INSERT INTO profile_skills (user_id, skill_id, score, source)
SELECT p.id, unnest(p.skills), 1.0, 'legacy'
FROM profiles p
WHERE p.skills IS NOT NULL AND array_length(p.skills, 1) > 0
ON CONFLICT (user_id, skill_id) DO NOTHING;

-- 7. Backfill pooled fingerprints so matcher v2 can score skills immediately.
-- Needed because pre-existing job_skills rows never hit the new triggers, and
-- bulk profile_skills inserts can leave embeddings stale if triggers were absent.
SELECT compute_profile_skill_embedding(user_id)
FROM (SELECT DISTINCT user_id FROM profile_skills) t;

SELECT compute_job_skill_embedding(job_id)
FROM (SELECT DISTINCT job_id FROM job_skills) t;
