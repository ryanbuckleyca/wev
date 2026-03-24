-- Migration A: ESCO vector search schema
-- Adds pgvector extension, embedding column to esco_skills,
-- job_skills junction table, and match_skills_by_embedding RPC.
-- Safe to run multiple times (idempotent).

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- 2. Add embedding column to esco_skills
ALTER TABLE esco_skills
    ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- 3. Create job_skills junction table
CREATE TABLE IF NOT EXISTS job_skills (
    job_id     uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id   text        NOT NULL REFERENCES esco_skills(concept_uri),
    score      float       NOT NULL,
    source     text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (job_id, skill_id)
);

-- 4. Enable RLS on job_skills
ALTER TABLE job_skills ENABLE ROW LEVEL SECURITY;

-- 5. RPC: match_skills_by_embedding
--    Returns top match_count skills ordered by cosine similarity to query_embedding.
--    Skips skills with NULL embeddings (not yet seeded).
--
--    match_count defaults to 80 so we cast a wide enough net for the floor filter.
--    Returning only 20 risks missing real matches ranked 21st-50th.
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
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$func$;
