-- Widen organizations_governance_subtype_check for taxonomy v1.1:
-- add GOV_3_2_INDIGENOUS_LAND_TRUST (Asset Stewardship / Indigenous &
-- Sovereign Land Trust). Codes mirror wev-scraper/utils/governance_taxonomy.py
-- (GOVERNANCE_TAXONOMY_VERSION v1.1). Do not rewrite 20261116190000.

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_governance_subtype_check;

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
      'GOV_3_2_INDIGENOUS_LAND_TRUST',
      'GOV_4_1_MEMBER_NPO',
      'GOV_4_2_WISE',
      'GOV_4_3_COMMUNITY_DEV_CORP',
      'GOV_5_1_MUTUAL_AID',
      'GOV_5_2_POPULAR_COLLECTIVE',
      'GOV_5_3_DEMOCRATIC_UNION',
      'EXCLUDED_NON_SSE'
    )) NOT VALID;

ALTER TABLE public.organizations
  VALIDATE CONSTRAINT organizations_governance_subtype_check;

COMMENT ON COLUMN public.organizations.governance_category IS
  'SSE governance parent category (GOV_1..GOV_5, or EXCLUDED). Source of truth: '
  'wev-scraper/utils/governance_taxonomy.py (v1.1). Replaces the legacy type axis.';
COMMENT ON COLUMN public.organizations.governance_subtype IS
  'SSE governance subtype (14 codes or EXCLUDED_NON_SSE). EXCLUDED_NON_SSE <=> is_sse=false.';
