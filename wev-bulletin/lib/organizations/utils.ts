/**
 * Shared utilities for organization display logic.
 */

/**
 * Resolves the effective sort value for the org index.
 * Falls back to 'org-asc' if the requested sort requires match scores but the
 * user doesn't have any (i.e., is logged out).
 */
export function resolveOrgSortBy(sortBy: string, hasMatchScores: boolean): string {
  return hasMatchScores || !sortBy.includes('match') ? sortBy : 'org-asc';
}

/**
 * Maps a raw org type string to a translated display label.
 * Returns the raw value unchanged for unrecognised types, null for empty.
 *
 * The `t` function must resolve keys relative to the `organizations` namespace
 * and expose a `has(key)` method (the next-intl translation function satisfies this).
 */
export function getOrganizationTypeLabel(
  type: string | null | undefined,
  t: { (key: string): string; has?: (key: string) => boolean },
): string | null {
  if (!type) return null;
  const normalized = type.toLowerCase().replace(/[\s_-]+/g, '');
  if (t.has?.(normalized)) return t(normalized);
  return type;
}
