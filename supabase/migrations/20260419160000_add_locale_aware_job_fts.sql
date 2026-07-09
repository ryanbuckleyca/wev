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
-- Recreate the view so Postgres re-expands j.* and includes newly-added columns.
-- DROP + CREATE avoids CREATE OR REPLACE column-position restrictions.
DROP VIEW IF EXISTS matched_jobs;
CREATE VIEW matched_jobs WITH (security_invoker = true) AS
SELECT
  j.*,
  s.name AS source,
  COALESCE(jm.score, 0) AS match_score,
  COALESCE(jm.value_score, 0) AS value_score,
  COALESCE(jm.skill_score, 0) AS skill_score
FROM jobs j
LEFT JOIN sources s ON j.source_id = s.id
LEFT JOIN job_matches jm
  ON j.id = jm.job_id
  AND jm.user_id = auth.uid();
