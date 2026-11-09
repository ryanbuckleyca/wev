-- jobs.extra holds paid API provider dumps (extra.source_dump). Keep the column
-- writable by service_role, but hide it from public PostgREST clients.
--
-- Table-level GRANT SELECT cannot be narrowed with REVOKE SELECT (extra) — the
-- table privilege still covers every column. Revoke table SELECT and re-grant
-- every column except extra.
-- Also rebuild matched_jobs without extra so SELECT * on the view cannot leak it.

comment on column public.jobs.extra is
  'Opaque scraper bag (API source_dump under extra.source_dump). '
  'SELECT revoked for anon/authenticated — service_role only.';

do $lockdown$
declare
  cols text;
begin
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'jobs'
    and c.column_name <> 'extra';

  if cols is null or cols = '' then
    raise exception 'jobs_extra_not_public: failed to list jobs columns';
  end if;

  -- Column-level SELECT is a fixed snapshot of public.jobs columns at apply
  -- time. Any future public.jobs column needs an explicit
  -- GRANT SELECT (new_col) … TO anon, authenticated, and matched_jobs must be
  -- rebuilt (same column list, still excluding extra) or clients will not see it.
  revoke select on table public.jobs from anon, authenticated;
  execute format(
    'grant select (%s) on table public.jobs to anon, authenticated',
    cols
  );
end;
$lockdown$;

-- service_role already has table-level SELECT/INSERT/UPDATE/DELETE; make the
-- column grant explicit so a future table-level revoke cannot strand dumps.
grant select (extra), insert (extra), update (extra) on table public.jobs to service_role;

do $rebuild$
declare
  cols text;
begin
  select string_agg(format('j.%I', c.column_name), ', ' order by c.ordinal_position)
    into cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'jobs'
    and c.column_name <> 'extra';

  if cols is null or cols = '' then
    raise exception 'jobs_extra_not_public: failed to list jobs columns';
  end if;

  execute 'drop view if exists public.matched_jobs';

  execute format(
    $v$
    create view public.matched_jobs with (security_invoker = true) as
    select
      %s,
      s.name as source,
      o.type as org_type,
      o.sector_id as org_sector_id,
      coalesce(jm.score, 0) as match_score,
      coalesce(jm.value_score, 0) as value_score,
      coalesce(jm.skill_score, 0) as skill_score
    from public.jobs j
    left join public.sources s on j.source_id = s.id
    left join public.organizations o on j.organization_id = o.id
    left join public.job_matches jm
      on j.id = jm.job_id
      and jm.user_id = auth.uid()
    $v$,
    cols
  );

  grant select on public.matched_jobs to anon, authenticated, service_role;

  execute $c$
    comment on view public.matched_jobs is
      'Jobs with source name, match scores, and org type/sector for bulletin facet filters. Excludes jobs.extra (provider dump).'
  $c$;
end;
$rebuild$;
