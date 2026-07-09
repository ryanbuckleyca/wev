/**
 * Shared utilities for organization display logic.
 */

export { getOrganizationTypeLabel, normalizeOrgTypeKey, orgTypeI18nKey } from './org-type';

/**
 * Resolves the effective sort value for the org index.
 * Falls back to 'org-asc' if the requested sort requires match scores but the
 * user doesn't have any (i.e., is logged out).
 */
export function resolveOrgSortBy(sortBy: string, hasMatchScores: boolean): string {
  return hasMatchScores || !sortBy.includes('match') ? sortBy : 'org-asc';
}
