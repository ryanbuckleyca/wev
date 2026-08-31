-- Park organizations that catch-up could not complete, so the scraper stops
-- re-spending LLM credits on the same rows every run.
--
-- Before this column, utils/catch_up.py selected orgs purely by "missing assessed
-- fields". A failed assessment wrote nothing, so the same incomplete orgs were
-- re-assessed on every scrape forever (location mismatches, private residences,
-- and provider 503s all behaved identically).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS assessment_skip_reason text;

COMMENT ON COLUMN public.organizations.assessment_skip_reason IS
  'Why the last organization assessment did not complete, or NULL when the org is '
  'eligible for a catch-up attempt. NULL means never attempted (or reset by an admin '
  'Retry) and the scraper may assess it exactly once. Any non-null value parks the row: '
  'catch-up skips it until a human clears the reason from the admin organizations page. '
  'The reserved value ''ignored'' parks the row and hides it from the default Needs '
  'review filter. Reasons written by the assessor: private_residence, llm_error, '
  'empty_response, parse_failed, location_mismatch. Reasons written by the catch-up '
  'layer or admin: no_new_fields, partial_fill, exception, incomplete_backlog, ignored.';

-- Partial index: the parked set stays small relative to the table, and every
-- admin query filters on "reason IS NOT NULL".
-- Note: CONCURRENTLY omitted — Supabase migrations run in a transaction
-- (see 20260708000002_org_search_indexes.sql).
CREATE INDEX IF NOT EXISTS idx_organizations_assessment_skip_reason
  ON public.organizations (assessment_skip_reason)
  WHERE assessment_skip_reason IS NOT NULL;

-- Backfill: park every currently-incomplete org so the next scrape does not burn
-- another full pass over the existing backlog. These land in the admin Needs review
-- queue, where a human can Retry the recoverable ones.
--
-- The predicate mirrors find_unprocessed_organizations() in wev-scraper/utils/catch_up.py,
-- including its falsy-string semantics (blank text counts as missing, and a blank
-- description_en falls back to the legacy description column).
UPDATE public.organizations
SET assessment_skip_reason = 'incomplete_backlog'
WHERE assessment_skip_reason IS NULL
  AND (
    NULLIF(btrim(sector_id), '') IS NULL
    OR NULLIF(btrim(type), '') IS NULL
    OR NULLIF(btrim(COALESCE(NULLIF(btrim(description_en), ''), description, '')), '') IS NULL
    OR NULLIF(btrim(description_fr), '') IS NULL
    OR language IS NULL
    OR language NOT IN ('en', 'fr', 'bilingual')
    OR values_list IS NULL
    OR cardinality(values_list) = 0
  );
