DROP FUNCTION IF EXISTS match_skills_by_embedding(vector, int);

-- NOTE: This function relies on a vector index (ivfflat or hnsw) on
-- esco_skills.embedding. Without it, the LATERAL ORDER BY <=> degrades to a
-- full sequential scan per input embedding. Verify the index exists before
-- deploying to production:
--   SELECT indexname FROM pg_indexes WHERE tablename = 'esco_skills';
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
AS $func$
    SELECT
        (q.idx - 1)::int AS query_index,
        e.concept_uri,
        e.preferred_label_en,
        e.preferred_label_fr,
        1 - (e.embedding <=> q.vec) AS similarity
    FROM unnest(query_embeddings) WITH ORDINALITY AS q(vec, idx)
    CROSS JOIN LATERAL (
        SELECT
            concept_uri,
            preferred_label_en,
            preferred_label_fr,
            embedding
        FROM esco_skills
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> q.vec
        LIMIT match_count
    ) e;
$func$;
