-- Add 'bilingual' to the allowed language values for jobs
-- First, drop any existing check constraint on language if it exists
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_language_check;

-- Add new check constraint that allows 'en', 'fr', and 'bilingual'
ALTER TABLE jobs ADD CONSTRAINT jobs_language_check CHECK (language IN ('en', 'fr', 'bilingual'));

-- Create index on language column for faster queries
CREATE INDEX IF NOT EXISTS jobs_language_idx ON jobs(language);

-- Backfill existing data: ensure all MaCommunaute and Centraide jobs are 'fr'
-- (Using source names to be environment-agnostic, works in dev/staging/prod)
UPDATE jobs
SET language = 'fr'
WHERE source_id IN (
    SELECT id FROM sources WHERE (name ILIKE '%ma communauté%' OR name ILIKE '%macommunaute%' OR name ILIKE '%centraide%')
);
