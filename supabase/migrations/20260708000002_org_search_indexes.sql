-- Migration: Add pg_trgm extension and GIN trigram indexes for organization text search
-- Addresses MergeGuard warning: ILIKE searches on organizations.name/description need indexes

-- Enable pg_trgm extension for trigram-based text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Create GIN trigram index on organizations.name for fast ILIKE searches
-- Note: CONCURRENTLY removed because Supabase migrations run in transactions
CREATE INDEX IF NOT EXISTS orgs_name_trgm_idx
  ON organizations USING gin (name gin_trgm_ops);
-- Create GIN trigram index on organizations.description for fast ILIKE searches
CREATE INDEX IF NOT EXISTS orgs_description_trgm_idx
  ON organizations USING gin (description gin_trgm_ops);
-- Create btree indexes for filter columns to avoid sequential scans
CREATE INDEX IF NOT EXISTS orgs_province_idx
  ON organizations (province);
CREATE INDEX IF NOT EXISTS orgs_municipality_idx
  ON organizations (municipality);
CREATE INDEX IF NOT EXISTS orgs_type_idx
  ON organizations (type);
-- Create composite index for organization job queries (JOIN + date filter)
-- Note: jobs_organization_id_idx already exists; this composite index is more specific
-- for queries that JOIN on organization_id AND filter by date_posted
CREATE INDEX IF NOT EXISTS jobs_org_id_date_posted_idx
  ON jobs (organization_id, date_posted DESC);
-- Comments for search indexes
COMMENT ON INDEX orgs_name_trgm_idx IS
  'Trigram GIN index for fast ILIKE/similarity searches on organization name';
COMMENT ON INDEX orgs_description_trgm_idx IS
  'Trigram GIN index for fast ILIKE/similarity searches on organization description';
-- Comments for filter indexes
COMMENT ON INDEX orgs_province_idx IS
  'Btree index for filtering organizations by province';
COMMENT ON INDEX orgs_municipality_idx IS
  'Btree index for filtering organizations by municipality';
COMMENT ON INDEX orgs_type_idx IS
  'Btree index for filtering organizations by type';
COMMENT ON INDEX jobs_org_id_date_posted_idx IS
  'Composite btree index for organization job queries (JOIN on organization_id + filter by date_posted)';
