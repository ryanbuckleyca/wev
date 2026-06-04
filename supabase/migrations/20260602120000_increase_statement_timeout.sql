-- Scope the statement timeout for vector similarity search to just the
-- match_skills_by_embedding function rather than the entire role. This
-- prevents an unrelated runaway query from holding a connection for 60s
-- while still giving the HNSW search the headroom it needs.
--
-- The previous version of this migration applied `ALTER ROLE ... SET
-- statement_timeout = '60s'`, which affected every query the role executed.
-- We undo that and instead attach the timeout to the function itself.
ALTER ROLE authenticated  RESET statement_timeout;
ALTER ROLE authenticator  RESET statement_timeout;

-- Re-create the batch overload with a function-scoped statement_timeout and
-- optimized LATERAL join to force index scans while allowing parallelization.
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

-- Re-create the single vector overload with the same function-scoped timeout.
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
