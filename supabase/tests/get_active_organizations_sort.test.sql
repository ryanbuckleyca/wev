-- Verifies get_active_organizations honours p_sort ordering, especially the
-- date-desc branch added in 20260714000001 (orders by newest active job posting).
-- Run with: supabase test db

begin;

select plan(2);

insert into public.sources (id, name, url)
values ('00000000-0000-4000-8000-0000000000aa', 'Sort Test Source', 'https://example.test');

insert into public.organizations (id, name, slug, is_sse, created_at)
values
  (990001, 'AAA Stale Org', 'aaa-stale-org-990001', true, now()),
  (990002, 'ZZZ Fresh Org', 'zzz-fresh-org-990002', true, now());

-- Stale org's newest job is older; fresh org's newest job is more recent.
insert into public.jobs
  (id, source_id, organization, organization_id, job_title, listing_url, date_posted, work_type)
values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000aa',
   'AAA Stale Org', 990001, 'Stale Role', 'https://example.test/1', '2026-01-01', 'office'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000aa',
   'ZZZ Fresh Org', 990002, 'Fresh Role', 'https://example.test/2', '2026-06-01', 'office');

-- date-desc: the org with the most recent active job posting comes first,
-- even though it sorts last alphabetically.
select is(
  (
    select name from (
      select name, row_number() over () as rn
      from public.get_active_organizations(
        '2000-01-01'::timestamptz, 20, 0, null, true, null, null, null, null, 'date-desc'
      )
    ) ranked
    where rn = 1
  ),
  'ZZZ Fresh Org',
  'date-desc returns the org with the newest active job first'
);

-- org-asc: alphabetical order, proving date-desc is not just returning insert order.
select is(
  (
    select name from (
      select name, row_number() over () as rn
      from public.get_active_organizations(
        '2000-01-01'::timestamptz, 20, 0, null, true, null, null, null, null, 'org-asc'
      )
    ) ranked
    where rn = 1
  ),
  'AAA Stale Org',
  'org-asc returns organizations in ascending name order'
);

select * from finish();

rollback;
