-- jobs.extra (API source_dump) must not be readable by anon/authenticated.
-- Run with: supabase test db

begin;

select plan(6);

select ok(
  exists(
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'extra'
      and grantee = 'service_role'
      and privilege_type = 'SELECT'
  ),
  'service_role can SELECT jobs.extra'
);

select ok(
  not has_column_privilege('anon', 'public.jobs', 'extra', 'SELECT')
  and not has_column_privilege('authenticated', 'public.jobs', 'extra', 'SELECT'),
  'anon/authenticated cannot SELECT jobs.extra'
);

select ok(
  not exists(
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'jobs'
      and c.column_name <> 'extra'
      and (
        not has_column_privilege('anon', 'public.jobs', c.column_name, 'SELECT')
        or not has_column_privilege(
          'authenticated', 'public.jobs', c.column_name, 'SELECT'
        )
      )
  ),
  'anon/authenticated retain SELECT on every jobs column except extra'
);

select ok(
  not exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matched_jobs'
      and column_name = 'extra'
  ),
  'matched_jobs does not expose extra'
);

-- Executable SELECTs under each role catch missing view/join grants that
-- privilege catalog checks alone would miss.
set local role anon;
select lives_ok(
  $$select id from public.matched_jobs limit 1$$,
  'anon can SELECT from matched_jobs'
);
reset role;

set local role authenticated;
select lives_ok(
  $$select id from public.matched_jobs limit 1$$,
  'authenticated can SELECT from matched_jobs'
);
reset role;

select * from finish();

rollback;
