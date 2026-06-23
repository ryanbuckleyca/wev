-- Fix for HNSW index scans in pgvector and scoped statement timeouts.
--
-- Postgres query planner will default to a sequential scan for vector ORDER BY 
-- queries if there's a WHERE clause on the same column (like WHERE embedding IS NOT NULL)
-- unless specific conditions are met. 
--
-- To resolve this while still filtering out rows without embeddings (which would 
-- otherwise return NULL similarity and potentially slow down the scan), we 
-- replace the HNSW index with a partial index that explicitly includes the 
-- NOT NULL constraint. This allows the planner to use the index even when 
-- the WHERE clause is present.

-- 1. Undo any previous role-level timeout settings
ALTER ROLE authenticated RESET statement_timeout;
ALTER ROLE authenticator RESET statement_timeout;
-- 2. Replace the HNSW index with a partial index to support the NOT NULL filter
DROP INDEX IF EXISTS esco_skills_embedding_hnsw;
CREATE INDEX esco_skills_embedding_hnsw
    ON esco_skills
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL;
-- 3. Update the batch overload with an optimized LATERAL join and NOT NULL filter.
--
-- The LATERAL join with an OFFSET 0 fence guarantees an index scan for each
-- vector while allowing the query to be parallelized by the Postgres planner.
CREATE OR REPLACE FUNCTION match_skills_by_embedding(
    query_embeddings vector(1024)[],
    match_count     int DEFAULT 5
)
RETURNS TABLE (
    query_index        int,
    concept_uri        text,
    preferred_label_en text,
    preferred_label_fr text,
    similarity         float
)
LANGUAGE sql STABLE
SET statement_timeout = '60s'
AS $func$
    WITH queries AS (
        SELECT (i - 1)::int AS query_index, query_embeddings[i] AS q_vec
        FROM generate_series(1, array_length(query_embeddings, 1)) AS i
        OFFSET 0 -- optimization fence
    )
    SELECT
        q.query_index,
        e.concept_uri,
        e.preferred_label_en,
        e.preferred_label_fr,
        1 - (e.embedding <=> q.q_vec) AS similarity
    FROM queries q
    CROSS JOIN LATERAL (
        SELECT
            e.concept_uri,
            e.preferred_label_en,
            e.preferred_label_fr,
            e.embedding
        FROM esco_skills e
        WHERE e.embedding IS NOT NULL
        ORDER BY e.embedding <=> q.q_vec
        LIMIT match_count
    ) e;
$func$;
-- 4. Update the single vector overload with the same filter and timeout.
CREATE OR REPLACE FUNCTION match_skills_by_embedding(
    query_embedding vector(1024),
    match_count     int DEFAULT 80
)
RETURNS TABLE (
    concept_uri        text,
    preferred_label_en text,
    preferred_label_fr text,
    similarity         float
)
LANGUAGE sql STABLE
SET statement_timeout = '60s'
AS $func$
    SELECT
        concept_uri,
        preferred_label_en,
        preferred_label_fr,
        1 - (embedding <=> query_embedding) AS similarity
    FROM esco_skills
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$func$;
