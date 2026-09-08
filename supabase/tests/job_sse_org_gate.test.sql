-- Job SSE requires org SSE; org demotion cascades to jobs.
-- Run with: supabase test db

begin;

select plan(4);

insert into public.sources (id, name, url)
values (
  '00000000-0000-4000-8000-0000000900aa',
  'SSE Gate Test Source',
  'https://example.test/sse-gate'
);

insert into public.organizations (id, name, slug, is_sse)
values
  (900001, 'SSE Gate Org Yes', 'sse-gate-org-yes-900001', true),
  (900002, 'SSE Gate Org No', 'sse-gate-org-no-900002', false);

insert into public.jobs (
  id, source_id, organization, organization_id, job_title, listing_url, is_sse, work_type
)
values (
  '00000000-0000-4000-8000-000000090001',
  '00000000-0000-4000-8000-0000000900aa',
  'SSE Gate Org Yes',
  900001,
  'Gate Test Job',
  'https://example.test/sse-gate-1',
  false,
  'office'
);

-- Promoting a job under a non-SSE org must fail.
select throws_ok(
  $$
    update public.jobs
    set is_sse = true, organization_id = 900002
    where id = '00000000-0000-4000-8000-000000090001'::uuid
  $$,
  '23514',
  'jobs.is_sse cannot be true unless organizations.is_sse is true',
  'rejects job SSE when organization is not SSE'
);

-- Promoting under an SSE org succeeds.
select lives_ok(
  $$
    update public.jobs
    set is_sse = true, organization_id = 900001
    where id = '00000000-0000-4000-8000-000000090001'::uuid
  $$,
  'allows job SSE when organization is SSE'
);

-- Clearing org SSE demotes its jobs.
update public.organizations set is_sse = false where id = 900001;

select is(
  (select is_sse from public.jobs where id = '00000000-0000-4000-8000-000000090001'::uuid),
  false,
  'demotes job is_sse when organization loses SSE'
);

-- Null organization_id cannot be SSE.
select throws_ok(
  $$
    update public.jobs
    set is_sse = true, organization_id = null
    where id = '00000000-0000-4000-8000-000000090001'::uuid
  $$,
  '23514',
  'jobs.is_sse cannot be true without an organization_id',
  'rejects job SSE without organization_id'
);

select * from finish();

rollback;
