-- Enable row-level security on the sector_remap_v25_community_civic table and
-- restrict access to service_role only. The table stores historical data for
-- backfill operations and should not be accessible to anon or authenticated users.

-- Enable RLS
ALTER TABLE public.sector_remap_v25_community_civic ENABLE ROW LEVEL SECURITY;

-- Revoke all privileges from anon and authenticated roles
REVOKE ALL ON TABLE public.sector_remap_v25_community_civic FROM anon;
REVOKE ALL ON TABLE public.sector_remap_v25_community_civic FROM authenticated;

-- Ensure service_role retains full access for backfill operations
-- (service_role is a superuser role, but we explicitly grant to be clear about intent)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sector_remap_v25_community_civic TO service_role;

COMMENT ON TABLE public.sector_remap_v25_community_civic IS
  'RLS-enabled table for tracking orgs cleared from community-civic-infrastructure during v2.5 remap. '
  'Access restricted to service_role for backfill operations only.';
