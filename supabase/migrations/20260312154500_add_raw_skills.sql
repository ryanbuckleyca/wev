-- Add raw_skills column to jobs table if it doesn't exist
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS raw_skills jsonb default '[]'::jsonb;
