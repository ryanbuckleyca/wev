/**
 * Shared utilities for organization display logic.
 */

import type { OrgType } from './constants';

type OrgTranslator = { (key: string): string; has: (key: string) => boolean };

/**
 * Resolves the effective sort value for the org index.
 * Falls back to 'org-asc' if the requested sort requires match scores but the
 * user doesn't have any (i.e., is logged out).
 */
export function resolveOrgSortBy(sortBy: string, hasMatchScores: boolean): string {
  return hasMatchScores || !sortBy.includes('match') ? sortBy : 'org-asc';
}

/** Normalizes a raw org type string for i18n lookup (e.g. non-profit → nonprofit). */
export function normalizeOrgTypeKey(type: string): string {
  return type.toLowerCase().replace(/[\s_-]+/g, '');
}

/** i18n key suffix for an org type value (e.g. social enterprise → socialenterprise). */
export function orgTypeI18nKey(type: OrgType | string): string {
  return normalizeOrgTypeKey(type);
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
  t: OrgTranslator,
): string | null {
  if (!type) return null;

  const normalized = normalizeOrgTypeKey(type);
  if (t.has(normalized)) return t(normalized);

  const nestedKey = `type.${normalized}`;
  if (t.has(nestedKey)) return t(nestedKey);

  return type;
}
