-- Add raw_skills column to jobs table
ALTER TABLE public.jobs ADD COLUMN raw_skills jsonb DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.jobs.raw_skills IS 'Array of raw skill keywords extracted from job posting text';