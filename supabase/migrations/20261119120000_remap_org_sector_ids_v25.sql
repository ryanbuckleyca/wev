-- Remap organizations.sector_id from the retired 11-sector v1 taxonomy to the
-- MASTER v2.5 17-sector IDs (shared/taxonomy/sectors.json legacy_id_map).
--
-- Apply with the bulletin/UI deploy that introduces SECTORS_LIST v2.5 so filters
-- and sector cards do not briefly diverge from legacy DB values.
--
-- Unambiguous 1:1 remaps run first. The former community-civic-infrastructure
-- cohort is ambiguous (e.g. tourist-lodging → recreation-tourism-hospitality
-- under v2.5 rules), so those rows are recorded then cleared to NULL for the
-- NULL-only LLM sector backfill rather than force-mapped to community-development.

-- Unambiguous remaps
UPDATE public.organizations
SET sector_id = 'social-health-care-services'
WHERE sector_id = 'care-health-social-services';

UPDATE public.organizations
SET sector_id = 'arts-culture-media'
WHERE sector_id = 'arts-culture-information';

UPDATE public.organizations
SET sector_id = 'production-construction-transportation'
WHERE sector_id = 'manufacturing-production';

-- Persist the exact former community-civic-infrastructure cohort so reprocessing
-- can select those orgs after sector_id is cleared (distinct from never-tagged).
CREATE TABLE IF NOT EXISTS public.sector_remap_v25_community_civic (
  organization_id bigint PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  prior_sector_id text NOT NULL,
  remapped_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sector_remap_v25_community_civic IS
  'Orgs that stored sector_id=community-civic-infrastructure before the v2.5 remap; '
  'sector_id was cleared to NULL for LLM reassessment (tourist-lodging → recreation-tourism-hospitality, etc.).';

INSERT INTO public.sector_remap_v25_community_civic (organization_id, prior_sector_id)
SELECT id, sector_id
FROM public.organizations
WHERE sector_id = 'community-civic-infrastructure'
ON CONFLICT (organization_id) DO NOTHING;

-- Leave ambiguous residual rows eligible for NULL-only sector backfill.
UPDATE public.organizations
SET sector_id = NULL
WHERE sector_id = 'community-civic-infrastructure';
