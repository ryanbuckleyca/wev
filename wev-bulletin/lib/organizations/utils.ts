/**
 * Shared utilities for organization display logic.
 */

export { getOrganizationTypeLabel, normalizeOrgTypeKey, orgTypeI18nKey } from './org-type';

/** Sort options offered on the org index (SortDropdown optionValues). */
export const ORG_INDEX_SORT_OPTIONS = [
  'date-desc',
  'value-match-desc',
  'org-asc',
  'org-desc',
] as const;

export type OrgIndexSortOption = (typeof ORG_INDEX_SORT_OPTIONS)[number];

const ORG_SORT_VALUES = new Set<string>(ORG_INDEX_SORT_OPTIONS);

/**
 * Resolves the effective sort value for the org index.
 * Unknown values fall back to a safe default. Value-match stays selectable when
 * logged out (scores are null; RPC falls through to name order).
 */
export function resolveOrgSortBy(sortBy: string, hasMatchScores: boolean): string {
  if (ORG_SORT_VALUES.has(sortBy)) return sortBy;
  return hasMatchScores ? 'value-match-desc' : 'org-asc';
}

/** Prefer structured mun/province; fall back to free-text location. */
export function formatOrgLocationLabel(org: {
  location?: string | null;
  municipality?: string | null;
  province?: string | null;
}): string | null {
  const mun = org.municipality?.trim() || '';
  const prov = org.province?.trim() || '';
  if (mun && prov) return `${mun}, ${prov}`;
  if (mun) return mun;
  if (prov) return prov;
  const loc = org.location?.trim() || '';
  return loc || null;
}
