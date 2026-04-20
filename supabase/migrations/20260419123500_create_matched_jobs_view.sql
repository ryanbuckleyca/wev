-- Add Full Text Search vector to jobs
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(job_title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(organization, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(location, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(municipality, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(province, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS jobs_fts_idx ON jobs USING GIN (fts);

-- Create or update the matched_jobs view
CREATE OR REPLACE VIEW matched_jobs WITH (security_invoker = true) AS
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
