-- raw_skills was used by the legacy LLM-based skill tagger (phase 1 of the old two-phase
-- pipeline). Skills are now tagged directly via Jina v3 vector embeddings into job_skills
-- and jobs.skills. This column is no longer written to or read by any code.
ALTER TABLE public.jobs DROP COLUMN IF EXISTS raw_skills;
