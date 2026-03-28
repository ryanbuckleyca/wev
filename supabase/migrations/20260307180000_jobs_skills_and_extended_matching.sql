-- Add skills support to jobs and extend job_matches schema.
-- Matching logic is centralized later in 20260328000000_job_confidence_in_matching.sql.

--------------------------------------------------------------------------------
-- Add jobs.skills column (ESCO concept URIs, max 10)
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
-- Extend job_matches with separate value/skill scoring
--------------------------------------------------------------------------------
ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS value_score float,
  ADD COLUMN IF NOT EXISTS skill_score float,
  ADD COLUMN IF NOT EXISTS shared_skills text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.job_matches.value_score IS 'Match score based on shared values (0-1, null if no values present).';
COMMENT ON COLUMN public.job_matches.skill_score IS 'Match score based on shared skills (0-1, null if no skills present).';
COMMENT ON COLUMN public.job_matches.shared_skills IS 'ESCO concept URIs shared between user and job.';

ALTER TABLE public.job_matches
  DROP CONSTRAINT IF EXISTS job_matches_score_check;

ALTER TABLE public.job_matches
  ALTER COLUMN score DROP NOT NULL;
