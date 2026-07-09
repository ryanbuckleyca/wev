-- Migration: Fix date comparison in get_active_organizations RPC
-- Description: Cast j.date_posted from text to timestamptz so it can be
-- compared with the min_date parameter. The column was originally stored as
-- text but all values are ISO-8601 timestamptz-compatible strings.

create or replace function public.get_active_organizations(
  min_date timestamp with time zone,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id bigint,
  name text,
  slug text,
  description text,
  website text,
  location text,
  is_sse boolean,
  type text,
  "values" text,
  logo_url text,
  created_at timestamp with time zone,
  sse_rating text,
  sse_details jsonb,
  mission_statement text,
  values_list text[],
  values_rated jsonb,
  active_job_count bigint,
  total_count bigint
)
language plpgsql
stable
set search_path = public
as $$
begin
  return query
  with org_counts as (
    select
      o.id,
      o.name,
      o.slug,
      o.description,
      o.website,
      o.location,
      o.is_sse,
      o.type,
      o.values,
      o.logo_url,
      o.created_at,
      o.sse_rating,
      o.sse_details,
      o.mission_statement,
      o.values_list,
      o.values_rated,
      count(j.id) as active_job_count
    from organizations o
    join jobs j on o.id = j.organization_id
    where
      j.date_posted::timestamp with time zone >= min_date
    group by o.id
  )
  select
    oc.id,
    oc.name,
    oc.slug,
    oc.description,
    oc.website,
    oc.location,
    oc.is_sse,
    oc.type,
    oc.values,
    oc.logo_url,
    oc.created_at,
    oc.sse_rating,
    oc.sse_details,
    oc.mission_statement,
    oc.values_list,
    oc.values_rated,
    oc.active_job_count,
    (select count(*) from org_counts)::bigint as total_count
  from org_counts oc
  order by oc.name asc
  limit p_limit
  offset p_offset;
end;
$$;
grant execute on function public.get_active_organizations(timestamp with time zone, integer, integer) to anon, authenticated, service_role;
comment on function public.get_active_organizations(timestamp with time zone, integer, integer) is
  'Returns organizations with active job counts within the given age window, sorted alphabetically, paginated.';
