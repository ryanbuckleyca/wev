-- Replace the row-by-row loop with a single bulk UPDATE via unnest.
-- This completes in one statement instead of 128, avoiding statement timeouts.
create or replace function bulk_update_skill_embeddings(
    updates jsonb
)
returns void
language sql
security definer
as $$
    update esco_skills s
    set embedding = (u.emb)::vector
    from (
        select
            item->>'uri' as uri,
            (
                select array_agg(v::float4)
                from jsonb_array_elements_text(item->'emb') as v
            )::vector as emb
        from jsonb_array_elements(updates) as item
    ) u
    where s.concept_uri = u.uri;
$$;
