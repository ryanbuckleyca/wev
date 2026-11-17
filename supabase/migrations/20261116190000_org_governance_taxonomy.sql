-- Add the Canadian SSE governance taxonomy (single-axis, 2-level) to
-- organizations, alongside the legacy `type` column. This migration only ADDS
-- columns, constraints, and indexes; it does not touch `type`, the
-- matched_jobs view, or the org filter RPCs. A later migration swaps those
-- readers to governance and drops `type`, once the LLM backfill has populated
-- governance_subtype across the table.
--
-- Codes mirror wev-scraper/utils/governance_taxonomy.py
-- (GOVERNANCE_TAXONOMY_VERSION v1). Keep the CHECK lists in sync with it.
--
-- Stored columns:
--   governance_category   GOV_1..GOV_5 | EXCLUDED | NULL
--   governance_subtype    one of 13 subtype codes | EXCLUDED_NON_SSE | NULL
--   governance_confidence model confidence 0.00..1.00
--   governance_reasoning  short free-text rationale
--   operational_tags      open-vocabulary snake_case delivery-mode tags

-- ── 1. Add columns (nullable; backfilled by the assessor / reprocess script) ─

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS governance_category   text,
  ADD COLUMN IF NOT EXISTS governance_subtype    text,
  ADD COLUMN IF NOT EXISTS governance_confidence numeric(3,2),
  ADD COLUMN IF NOT EXISTS governance_reasoning  text,
  ADD COLUMN IF NOT EXISTS operational_tags      text[] NOT NULL DEFAULT '{}';

-- ── 2. CHECK constraints ─────────────────────────────────────────────────────
-- Added NOT VALID first (a fast metadata-only step that skips the existing-row
-- scan), then validated in a second pass. Every existing row has NULL in these
-- brand-new columns, so validation is trivially satisfied, but keeping the
-- two-step shape avoids holding the stronger lock across a scan and matches the
-- repo's migration-safety convention. Idempotent: Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS, so the adds swallow duplicate_object and the
-- VALIDATE calls are no-ops once a constraint is already valid.

DO $$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_governance_category_check
      CHECK (governance_category IS NULL OR governance_category IN (
        'GOV_1', 'GOV_2', 'GOV_3', 'GOV_4', 'GOV_5', 'EXCLUDED'
      )) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_governance_subtype_check
      CHECK (governance_subtype IS NULL OR governance_subtype IN (
        'GOV_1_1_WORKER_COOP',
        'GOV_1_2_CONSUMER_COOP',
        'GOV_1_3_PRODUCER_COOP',
        'GOV_1_4_SOLIDARITY_COOP',
        'GOV_2_1_CREDIT_UNION',
        'GOV_2_2_MUTUAL_INSURANCE',
        'GOV_3_1_COMMUNITY_LAND_TRUST',
        'GOV_4_1_MEMBER_NPO',
        'GOV_4_2_WISE',
        'GOV_4_3_COMMUNITY_DEV_CORP',
        'GOV_5_1_MUTUAL_AID',
        'GOV_5_2_POPULAR_COLLECTIVE',
        'GOV_5_3_DEMOCRATIC_UNION',
        'EXCLUDED_NON_SSE'
      )) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_governance_confidence_range
      CHECK (governance_confidence IS NULL
             OR (governance_confidence >= 0 AND governance_confidence <= 1)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Category must match the subtype's GOV_<n> parent (or be EXCLUDED for the
-- excluded subtype). When either is NULL the pair is not yet classified.
-- Deriving the parent as 'GOV_' || split_part(subtype, '_', 2) stays correct for
-- any index width (GOV_1 … GOV_5 today, GOV_10+ later) rather than assuming a
-- fixed 5-char prefix.
DO $$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_governance_category_subtype_match
      CHECK (
        governance_subtype IS NULL
        OR governance_category IS NULL
        OR (
          governance_subtype = 'EXCLUDED_NON_SSE'
          AND governance_category = 'EXCLUDED'
        )
        OR (
          governance_subtype <> 'EXCLUDED_NON_SSE'
          AND governance_category = 'GOV_' || split_part(governance_subtype, '_', 2)
        )
      ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.organizations
  VALIDATE CONSTRAINT organizations_governance_category_check;
ALTER TABLE public.organizations
  VALIDATE CONSTRAINT organizations_governance_subtype_check;
ALTER TABLE public.organizations
  VALIDATE CONSTRAINT organizations_governance_confidence_range;
ALTER TABLE public.organizations
  VALIDATE CONSTRAINT organizations_governance_category_subtype_match;

-- ── 3. Indexes for facet filtering / browse-by-governance counts ─────────────

CREATE INDEX IF NOT EXISTS idx_orgs_governance_subtype
  ON public.organizations (governance_subtype);
CREATE INDEX IF NOT EXISTS idx_orgs_governance_category
  ON public.organizations (governance_category);

COMMENT ON COLUMN public.organizations.governance_category IS
  'SSE governance parent category (GOV_1..GOV_5, or EXCLUDED). Source of truth: '
  'wev-scraper/utils/governance_taxonomy.py (v1). Replaces the legacy type axis.';
COMMENT ON COLUMN public.organizations.governance_subtype IS
  'SSE governance subtype (13 codes or EXCLUDED_NON_SSE). EXCLUDED_NON_SSE <=> is_sse=false.';
COMMENT ON COLUMN public.organizations.operational_tags IS
  'Open-vocabulary snake_case delivery-mode tags (platform_coop, b2b_procurement, ...). '
  'NOT a governance axis.';
