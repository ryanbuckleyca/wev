-- Verifies get_active_organizations keeps the p_languages filter after the
-- bilingual org-content migration and still returns bilingual content fields.
-- Run with: supabase test db

begin;

select plan(2);

insert into public.sources (id, name, url)
values ('00000000-0000-4000-8000-0000000000ca', 'Language Test Source', 'https://example.test');

insert into public.organizations (
  id,
  name,
  slug,
  is_sse,
  created_at,
  language,
  description,
  description_en,
  description_fr,
  mission_statement,
  mission_statement_en,
  mission_statement_fr
)
values
  (
    990101,
    'English Filter Org',
    'english-filter-org-990101',
    true,
    now(),
    'en',
    'Legacy English description',
    'English bilingual description',
    null,
    'Legacy English mission',
    'English bilingual mission',
    null
  ),
  (
    990102,
    'French Filter Org',
    'french-filter-org-990102',
    true,
    now(),
    'fr',
    'Description francaise legacy',
    null,
    'Description francaise bilingue',
    'Mission francaise legacy',
    null,
    'Mission francaise bilingue'
  );

insert into public.jobs
  (id, source_id, organization, organization_id, job_title, listing_url, date_posted, work_type)
values
  (
    '00000000-0000-4000-8000-0000000000d1',
    '00000000-0000-4000-8000-0000000000ca',
    'English Filter Org',
    990101,
    'English Role',
    'https://example.test/en',
    '2026-06-01',
    'office'
  ),
  (
    '00000000-0000-4000-8000-0000000000d2',
    '00000000-0000-4000-8000-0000000000ca',
    'French Filter Org',
    990102,
    'French Role',
    'https://example.test/fr',
    '2026-06-02',
    'office'
  );

select is(
  (
    select string_agg(name, ',' order by name)
    from public.get_active_organizations(
      '2000-01-01'::timestamptz,
      20,
      0,
      null,
      true,
      null,
      null,
      null,
      null,
      'org-asc',
      array['en']
    )
  ),
  'English Filter Org',
  'p_languages filters the organizations RPC using the repaired 11-argument signature'
);

select is(
  (
    select description_fr
    from public.get_active_organizations(
      '2000-01-01'::timestamptz,
      20,
      0,
      null,
      true,
      null,
      null,
      null,
      null,
      'org-asc',
      array['fr']
    )
    limit 1
  ),
  'Description francaise bilingue',
  'the repaired RPC still returns bilingual organization content columns'
);

select * from finish();

rollback;
