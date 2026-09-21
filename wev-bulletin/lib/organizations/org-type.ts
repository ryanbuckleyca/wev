import type { OrgType } from './constants';
import { ORG_TYPES } from './constants';

type OrgTranslator = { (key: string): string; has: (key: string) => boolean };

const ORG_TYPE_ALIASES: Record<string, OrgType> = {
  nonprofit: 'nonprofit',
  cooperative: 'cooperative',
  // Dropped label — treat as residual / never-SSE.
  socialenterprise: 'other',
  // Interim maps until a dedicated taxonomy branch splits these terms.
  mutual: 'nonprofit',
  mutualaid: 'nonprofit',
  mutualaidgroup: 'nonprofit',
  mutualsociety: 'nonprofit',
  community: 'nonprofit',
  communityassociation: 'nonprofit',
  communityproject: 'nonprofit',
  creditunion: 'cooperative',
  government: 'government',
  union: 'union',
  other: 'other',
};

/** Normalize a raw type string for i18n lookup (e.g. non-profit → nonprofit). */
export function normalizeOrgTypeKey(type: string): string {
  return type.toLowerCase().replace(/[\s_-]+/g, '');
}

/** i18n key suffix for an org type value (e.g. social enterprise → socialenterprise). */
export function orgTypeI18nKey(type: OrgType | string): string {
  return normalizeOrgTypeKey(type);
}

/** Map user input to a canonical org type stored in the database. */
export function normalizeOrgType(raw: string | null | undefined): OrgType | null {
  if (!raw?.trim()) return null;
  return ORG_TYPE_ALIASES[normalizeOrgTypeKey(raw)] ?? null;
}

export function isOrgType(value: string): value is OrgType {
  return (ORG_TYPES as readonly string[]).includes(value);
}

/**
 * Expand canonical type filter values to stored DB spellings that should match.
 * matched_jobs.org_type is the raw organizations.type string; UI sends canonical
 * ORG_TYPES (e.g. nonprofit). Include hyphen/underscore/space variants so
 * `.in('org_type', …)` behaves like normalizeOrgType matching.
 */
export function expandOrgTypeFilterSelection(selected: readonly string[]): string[] {
  if (selected.length === 0) return [];

  const expanded = new Set<string>();
  for (const value of selected) {
    const canonical = normalizeOrgType(value) ?? value;
    expanded.add(canonical);

    for (const [aliasKey, mapped] of Object.entries(ORG_TYPE_ALIASES)) {
      if (mapped !== canonical) continue;
      expanded.add(aliasKey);
    }

    if (canonical === 'nonprofit') {
      expanded.add('non-profit');
      expanded.add('non_profit');
      expanded.add('Non-Profit');
    }
    if (canonical === 'cooperative') {
      expanded.add('co-operative');
      expanded.add('co_operative');
      expanded.add('Co-operative');
    }
  }

  return Array.from(expanded);
}

/**
 * Maps a raw org type string to a translated display label.
 * Returns the raw value unchanged for unrecognised types, null for empty.
 */
export function getOrganizationTypeLabel(
  type: string | null | undefined,
  t: OrgTranslator,
): string | null {
  if (!type) return null;

  // Resolve aliases first so legacy labels (e.g. social enterprise → other) translate.
  const canonical = normalizeOrgType(type);
  const lookupKey = canonical ?? normalizeOrgTypeKey(type);
  if (t.has(lookupKey)) return t(lookupKey);

  const nestedKey = `type.${lookupKey}`;
  if (t.has(nestedKey)) return t(nestedKey);

  return canonical ?? type;
}
