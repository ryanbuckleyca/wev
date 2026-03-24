-- Increase statement timeout inside bulk_update_skill_embeddings to avoid
-- cancellation on large batches during ESCO skill seeding.
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
