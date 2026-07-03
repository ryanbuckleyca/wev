-- disable_ddl_transaction
-- Create index on jobs.organization_id CONCURRENTLY (won't block writes)
-- Added in 20260701000000, index deferred to avoid blocking large jobs table.
COMMIT;
CREATE INDEX CONCURRENTLY IF NOT EXISTS jobs_organization_id_idx ON jobs(organization_id);
