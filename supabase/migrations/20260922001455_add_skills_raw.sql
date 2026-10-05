-- Add skills_raw column to hold LLM-extracted skill and duty phrases
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills_raw text[];
