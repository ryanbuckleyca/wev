-- Add language column to jobs table.
-- Stores the content language of the job posting (e.g. 'en', 'fr').
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
