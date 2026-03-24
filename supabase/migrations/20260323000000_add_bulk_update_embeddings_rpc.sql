-- Bulk-update esco_skills.embedding in a single round-trip.
-- Called by scripts/seed_esco_embeddings.py to avoid N individual UPDATE calls.
--
-- Usage (from Python):
--   supabase.rpc("bulk_update_skill_embeddings", {"updates": [
--       {"uri": "http://...", "emb": [0.1, 0.2, ...]},
--       ...
--   ]}).execute()

create or replace function bulk_update_skill_embeddings(
    updates jsonb
)
returns void
language plpgsql
security definer
as $$
declare
    item jsonb;
begin
    set local statement_timeout = '120s';
    for item in select * from jsonb_array_elements(updates)
    loop
        update esco_skills
        set embedding = (
            select array_agg(v::float4)
            from jsonb_array_elements_text(item->'emb') as v
        )::vector
        where concept_uri = item->>'uri';
    end loop;
end;
$$;
