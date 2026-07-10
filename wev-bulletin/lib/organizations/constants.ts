export const ORG_JOBS_PER_PAGE = 20;
export const ORG_INDEX_PAGE_SIZE = 20;
export const ADMIN_ORGS_PER_PAGE = 50;

/** Canonical org type values stored in the database (aligned with scraper). */
export const ORG_TYPES = [
  'nonprofit',
  'cooperative',
  'social enterprise',
  'government',
  'union',
  'other',
] as const;

export type OrgType = (typeof ORG_TYPES)[number];

export const MAX_ORG_VALUES = 5;

export const MAX_ORG_DESCRIPTION_LENGTH = 500;
export const MAX_ORG_MISSION_LENGTH = 300;

/** Columns loaded/edited by the admin form. */
export const ORG_ADMIN_FORM_COLUMNS =
  'id, name, slug, description, mission_statement, website, location, municipality, province, lat, lng, geocode_accuracy_type, type, is_sse, values, values_list' as const;

export const SLUG_PATTERN = /^[a-z0-9-]+$/;
