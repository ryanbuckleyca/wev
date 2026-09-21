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

/**
 * Raw spellings that may appear in organizations.type for a given alias key.
 * Used by expandOrgTypeFilterSelection so PostgREST `.in('org_type', …)` hits
 * spaced/hyphenated/cased variants, not only the compacted alias key.
 */
const ORG_TYPE_ALIAS_RAW_FORMS: Record<string, readonly string[]> = {
  nonprofit: ['non-profit', 'non_profit', 'Non-Profit', 'Non Profit', 'Nonprofit'],
  cooperative: [
    'co-operative',
    'co_operative',
    'Co-operative',
    'Co Operative',
    'Cooperative',
  ],
  socialenterprise: [
    'social enterprise',
    'social-enterprise',
    'Social Enterprise',
    'SocialEnterprise',
  ],
  mutualaid: ['mutual aid', 'Mutual Aid', 'mutual-aid', 'Mutual-Aid'],
  mutualaidgroup: [
    'mutual aid group',
    'Mutual Aid Group',
    'mutual-aid-group',
    'Mutual-Aid-Group',
  ],
  mutualsociety: ['mutual society', 'Mutual Society', 'mutual-society'],
  communityassociation: [
    'community association',
    'Community Association',
    'community-association',
  ],
  communityproject: ['community project', 'Community Project', 'community-project'],
  creditunion: ['credit union', 'Credit Union', 'credit-union', 'Credit-Union'],
  government: ['Government'],
  union: ['Union'],
  other: ['Other'],
  mutual: ['Mutual'],
  community: ['Community'],
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
      for (const form of ORG_TYPE_ALIAS_RAW_FORMS[aliasKey] ?? []) {
        expanded.add(form);
      }
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
