-- Migration B: HNSW index on esco_skills.embedding
--
-- !! IMPORTANT: Apply this migration AFTER running seed_esco_embeddings.py !!
--
-- If you run `supabase db push` before seeding, this migration will apply
-- automatically (filenames are sequential) and build an index on an empty
-- embedding column. That is harmless — the index will still work once rows
-- are populated — but you'll get a warning from pgvector about indexing
-- zero vectors. Re-running this migration after seeding is a no-op
-- (CREATE INDEX IF NOT EXISTS is idempotent).
--
-- Recommended order:
--   1. supabase db push  (applies Migration A + B)
--   2. python -m scripts.seed_esco_embeddings [--prod]
--   3. (optional) REINDEX INDEX CONCURRENTLY esco_skills_embedding_hnsw
--      if you want the index rebuilt on the fully-populated table for
--      optimal recall. Not required — pgvector updates the index
--      incrementally during upserts.
--
-- Safe to run multiple times (idempotent).

CREATE INDEX IF NOT EXISTS esco_skills_embedding_hnsw
    ON esco_skills
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
