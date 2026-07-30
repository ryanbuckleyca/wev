export const ORG_JOBS_PER_PAGE = 20;
export const ORG_INDEX_PAGE_SIZE = 20;
export const ADMIN_ORGS_PER_PAGE = 50;

/** Canonical org type values stored in the database (aligned with scraper).
 *
 * SSE-eligible stored types: nonprofit, cooperative, union.
 * Never SSE: government, other.
 * Mutual societies / mutual-aid / community associations map to nonprofit
 * (aliases) until a dedicated taxonomy branch defines separate terms.
 * Former "social enterprise" label was dropped — it invited mission-only
 * Yes ratings; legacy values alias/migrate to other.
 */
export const ORG_TYPES = [
  'nonprofit',
  'cooperative',
  'government',
  'union',
  'other',
] as const;

export type OrgType = (typeof ORG_TYPES)[number];

export const MAX_ORG_VALUES = 5;

/** Hard max lengths for description/mission (scraper + admin UI must match). */
export const MAX_ORG_DESCRIPTION_LENGTH = 500;
export const MAX_ORG_MISSION_LENGTH = 500;

/** Columns loaded/edited by the admin form. */
export const ORG_ADMIN_FORM_COLUMNS =
  'id, name, slug, description, description_en, description_fr, mission_statement, mission_statement_en, mission_statement_fr, website, location, municipality, province, lat, lng, geocode_accuracy_type, type, is_sse, values, values_list' as const;

export const SLUG_PATTERN = /^[a-z0-9-]+$/;
