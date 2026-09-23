-- disable_ddl_transaction
-- HNSW indexes for pooled skill_embedding fingerprints (jobs + profiles).
-- CONCURRENTLY avoids blocking writes on large tables (cannot run inside a
-- transaction — COMMIT first, matching 20260911130000 / 20260701000001).
-- Safe if indexes already exist from an earlier non-concurrent apply.
COMMIT;

CREATE INDEX CONCURRENTLY IF NOT EXISTS jobs_skill_embedding_hnsw_idx
  ON jobs USING hnsw (skill_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_skill_embedding_hnsw_idx
  ON profiles USING hnsw (skill_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
