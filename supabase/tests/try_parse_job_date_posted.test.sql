-- Date-only scrape/seed strings must parse for org-index active-job RPCs.
-- Run with: supabase test db

begin;

select plan(3);

select ok(
  public.try_parse_job_date_posted('2026-07-06') is not null,
  'date-only YYYY-MM-DD parses'
);

select ok(
  public.try_parse_job_date_posted('2026-07-06T12:00:00Z') is not null,
  'ISO timestamptz parses'
);

select ok(
  public.try_parse_job_date_posted('') is null,
  'empty string returns NULL'
);

select * from finish();

rollback;
