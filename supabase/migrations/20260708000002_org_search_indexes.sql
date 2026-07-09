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

COMMENT ON INDEX orgs_name_trgm_idx IS
  'Trigram GIN index for fast ILIKE/similarity searches on organization name';

COMMENT ON INDEX orgs_description_trgm_idx IS
  'Trigram GIN index for fast ILIKE/similarity searches on organization description';
