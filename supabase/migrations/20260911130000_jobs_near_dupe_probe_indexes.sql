-- disable_ddl_transaction
-- Composite indexes for the near-duplicate insert probe in utils/db.py
-- (_find_confident_near_duplicate): filter by organization_id OR organization,
-- ordered by scraped_at DESC. CONCURRENTLY to avoid blocking writes on the
-- large jobs table (cannot run inside a transaction — COMMIT first, matching
-- 20260701000001_add_jobs_organization_id_idx_concurrently.sql).
COMMIT;

CREATE INDEX CONCURRENTLY IF NOT EXISTS jobs_org_id_scraped_at_idx
  ON jobs (organization_id, scraped_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS jobs_org_name_scraped_at_idx
  ON jobs (organization, scraped_at DESC);
