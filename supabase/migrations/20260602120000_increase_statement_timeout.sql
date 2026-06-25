-- Increase statement timeout for vector similarity search RPCs.
--
-- The default local Supabase timeouts (8s for authenticated, 8s for authenticator)
-- are too short for match_skills_by_embedding with 18 input vectors against
-- a 105MB HNSW index in a memory-constrained Docker environment.
--
-- Applying 60s on staging/prod is safe — the query runs well within that on
-- hosted hardware where the HNSW index stays in RAM. This just raises the
-- ceiling as a defensive measure.
ALTER ROLE authenticated  SET statement_timeout = '60s';
ALTER ROLE authenticator  SET statement_timeout = '60s';
