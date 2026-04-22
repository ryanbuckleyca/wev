-- Verifies generated salary availability and matched_jobs view exposure.
-- Run with: supabase test db

begin;

select plan(3);

select ok(
  exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'has_compensation'
  ),
  'jobs exposes has_compensation'
);

select ok(
  exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matched_jobs'
      and column_name = 'has_compensation'
  ),
  'matched_jobs exposes has_compensation'
);

select ok(
  (
    select coalesce(is_generated, 'NEVER')
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'has_compensation'
  ) = 'ALWAYS',
  'has_compensation is a generated column'
);

select * from finish();

rollback;
