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
 * Maps a raw org type string to a translated display label.
 * Returns the raw value unchanged for unrecognised types, null for empty.
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
