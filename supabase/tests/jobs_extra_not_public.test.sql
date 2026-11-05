-- jobs.extra (API source_dump) must not be readable by anon/authenticated.
-- Run with: supabase test db

begin;

select plan(3);

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
  not exists(
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'extra'
      and grantee in ('anon', 'authenticated')
      and privilege_type = 'SELECT'
  ),
  'anon/authenticated cannot SELECT jobs.extra'
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

select * from finish();

rollback;
