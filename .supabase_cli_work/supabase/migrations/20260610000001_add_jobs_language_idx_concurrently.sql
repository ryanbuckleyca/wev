-- disable_ddl_transaction
-- Create index on jobs.language CONCURRENTLY (won't block writes)
COMMIT;
CREATE INDEX CONCURRENTLY IF NOT EXISTS jobs_language_idx ON jobs(language);
