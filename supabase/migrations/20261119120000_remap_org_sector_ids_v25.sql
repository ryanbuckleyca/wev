-- Remap organizations.sector_id from the retired 11-sector v1 taxonomy to the
-- MASTER v2.5 17-sector IDs (shared/taxonomy/sectors.json legacy_id_map).

UPDATE public.organizations
SET sector_id = 'social-health-care-services'
WHERE sector_id = 'care-health-social-services';

UPDATE public.organizations
SET sector_id = 'arts-culture-media'
WHERE sector_id = 'arts-culture-information';

UPDATE public.organizations
SET sector_id = 'production-construction-transportation'
WHERE sector_id = 'manufacturing-production';

UPDATE public.organizations
SET sector_id = 'community-development-philanthropy-volunteering'
WHERE sector_id = 'community-civic-infrastructure';
