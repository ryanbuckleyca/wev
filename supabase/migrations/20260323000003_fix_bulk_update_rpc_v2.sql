-- Rewrite bulk_update_skill_embeddings to cast jsonb array directly to vector
-- instead of using per-row array_agg unnest (which was slow and timing out).
create or replace function bulk_update_skill_embeddings(
    updates jsonb
)
returns void
language sql
security definer
as $$
    update esco_skills s
    set embedding = (u.emb::text::vector)
    from (
        select
            item->>'uri' as uri,
            item->'emb' as emb
        from jsonb_array_elements(updates) as item
    ) u
    where s.concept_uri = u.uri;
$$;
