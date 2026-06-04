-- Fix for HNSW index scans in pgvector and scoped statement timeouts.
--
-- Postgres query planner will default to a sequential scan for vector ORDER BY
-- queries if there's a WHERE clause on the same column (like WHERE embedding IS NOT NULL)
-- unless specific conditions are met. Because the index inherently handles NULLs
-- or ignores them during similarity search, we can safely remove this WHERE clause
-- to enable lightning-fast HNSW index scans and resolve the statement timeouts.
--
-- Additionally, we scope the statement timeout to just these functions rather than
-- the entire role. This prevents unrelated runaway queries from holding connections
-- for 60s while giving HNSW search the headroom it needs.

-- Undo any previous role-level timeout settings
ALTER ROLE authenticated RESET statement_timeout;
ALTER ROLE authenticator RESET statement_timeout;

-- Update the batch overload with an optimized LATERAL join.
--
-- The LATERAL join with an OFFSET 0 fence guarantees an index scan for each
-- vector while allowing the query to be parallelized by the Postgres planner,
-- which is more efficient than a sequential PL/pgSQL loop.
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
        ORDER BY e.embedding <=> q.q_vec
        LIMIT match_count
    ) e;
$func$;

-- Update the single vector overload
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
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$func$;
