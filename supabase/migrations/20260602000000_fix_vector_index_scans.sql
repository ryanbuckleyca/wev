-- Fix for HNSW index scans in pgvector.
--
-- Postgres query planner will default to a sequential scan for vector ORDER BY 
-- queries if there's a WHERE clause on the same column (like WHERE embedding IS NOT NULL)
-- unless specific conditions are met. Because the index inherently handles NULLs
-- or ignores them during similarity search, we can safely remove this WHERE clause
-- to enable lightning-fast HNSW index scans and resolve the statement timeouts.

-- Update the batch overload (using PL/pgSQL loop to guarantee index scans)
--
-- By using a PL/pgSQL loop, each vector is treated as an explicit parameter in a
-- scalar query. pgvector handles explicit scalar parameter queries with LIMIT
-- by perfectly utilizing the HNSW index, bypassing the LATERAL join planner quirks.
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
LANGUAGE plpgsql STABLE
AS $func$
DECLARE
    q_vec vector(1024);
    i int;
BEGIN
    FOR i IN 1..array_length(query_embeddings, 1) LOOP
        q_vec := query_embeddings[i];
        
        RETURN QUERY
        SELECT
            (i - 1)::int AS query_index,
            e.concept_uri,
            e.preferred_label_en,
            e.preferred_label_fr,
            1 - (e.embedding <=> q_vec) AS similarity
        FROM esco_skills e
        -- Removed: WHERE embedding IS NOT NULL
        ORDER BY e.embedding <=> q_vec
        LIMIT match_count;
    END LOOP;
END;
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
AS $func$
    SELECT
        concept_uri,
        preferred_label_en,
        preferred_label_fr,
        1 - (embedding <=> query_embedding) AS similarity
    FROM esco_skills
    -- Removed: WHERE embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$func$;
