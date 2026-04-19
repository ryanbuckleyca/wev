-- Add locale-aware full-text search vectors for jobs.
-- Keep both English and French vectors so we can query by request locale.
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS fts_en tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(job_title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(organization, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(location, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(municipality, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(province, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'C')
) STORED,
ADD COLUMN IF NOT EXISTS fts_fr tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('french', coalesce(job_title, '')), 'A') ||
  setweight(to_tsvector('french', coalesce(organization, '')), 'A') ||
  setweight(to_tsvector('french', coalesce(location, '')), 'B') ||
  setweight(to_tsvector('french', coalesce(municipality, '')), 'B') ||
  setweight(to_tsvector('french', coalesce(province, '')), 'B') ||
  setweight(to_tsvector('french', coalesce(summary, '')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS jobs_fts_en_idx ON jobs USING GIN (fts_en);
CREATE INDEX IF NOT EXISTS jobs_fts_fr_idx ON jobs USING GIN (fts_fr);
