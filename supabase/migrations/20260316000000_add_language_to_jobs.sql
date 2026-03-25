-- Add language column to jobs table.
-- Stores the content language of the job posting (e.g. 'en', 'fr').
-- Defaults to 'en' for existing rows; backfill below sets French sources correctly.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';

-- Backfill: MaCommunaute (two sources) and Centraide are French
UPDATE jobs
SET language = 'fr'
WHERE source_id IN (
    '01a58f5e-f47c-4310-a2d1-6627a57e2071',  -- MaCommunaute emplois
    '394fd635-bf74-463a-9e74-b17405a8b688',  -- MaCommunaute benevolat
    'c068cbc6-90a5-45cb-95a1-a7281dd76198'   -- Centraide
);
