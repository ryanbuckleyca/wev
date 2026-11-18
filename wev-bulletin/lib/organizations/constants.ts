export const ORG_JOBS_PER_PAGE = 20;
export const ORG_INDEX_PAGE_SIZE = 20;
export const ADMIN_ORGS_PER_PAGE = 50;

/** Cross-request Data Cache tag for anonymous org SSR/API payloads. */
export const ORG_CACHE_TAG = 'organizations';

export const MAX_ORG_VALUES = 5;

/** Public-facing language of the organization (aligned with the scraper). */
export const ORG_LANGUAGES = ['en', 'fr', 'bilingual'] as const;

export type OrgLanguage = (typeof ORG_LANGUAGES)[number];

/** Hard max lengths for description/mission (scraper + admin UI must match). */
export const MAX_ORG_DESCRIPTION_LENGTH = 500;
export const MAX_ORG_MISSION_LENGTH = 500;

/** Columns loaded/edited by the admin form.
 *
 * sector_id is loaded (not just written) so the sector select starts populated;
 * assessment_skip_reason drives the review banner and is never free-typed.
 * language is part of the completeness check, so it must be editable here or a
 * parked org missing it could never be completed by hand.
 */
export const ORG_ADMIN_FORM_COLUMNS =
  'id, name, slug, description, description_en, description_fr, mission_statement, mission_statement_en, mission_statement_fr, website, location, municipality, province, lat, lng, geocode_accuracy_type, governance_subtype, governance_category, governance_confidence, governance_reasoning, sector_id, is_sse, values, values_list, language, assessment_skip_reason' as const;

export const SLUG_PATTERN = /^[a-z0-9-]+$/;
