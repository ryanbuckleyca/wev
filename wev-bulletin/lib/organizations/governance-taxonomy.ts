/**
 * Canadian SSE governance taxonomy (single-axis, 2-level).
 *
 * Sourced directly from shared/taxonomy/governance.json — keep version
 * and codes unified across frontend and scraper pipelines. Category is
 * always derived from subtype; never invent a category independently.
 */

import governanceTaxonomy from '@shared/taxonomy/governance.json';

const rawVersion = String(governanceTaxonomy.version ?? '1.2');
export const GOVERNANCE_TAXONOMY_VERSION = rawVersion.startsWith('v')
  ? rawVersion
  : `v${rawVersion}`;

export const EXCLUDED_CATEGORY = 'EXCLUDED' as const;
export const EXCLUDED_SUBTYPE = 'EXCLUDED_NON_SSE' as const;

export const GOVERNANCE_CATEGORIES = governanceTaxonomy.categories as Record<
  string,
  { code?: string; label_en: string; label_fr: string }
>;

export type GovernanceCategory = keyof typeof governanceTaxonomy.categories;

/** SSE category codes used by job-board / org-directory filter checkboxes. */
export const SSE_GOVERNANCE_FILTER_CATEGORIES = [
  'GOV_1',
  'GOV_2',
  'GOV_3',
  'GOV_4',
  'GOV_5',
] as const satisfies ReadonlyArray<Exclude<GovernanceCategory, typeof EXCLUDED_CATEGORY>>;

/** Ordered SSE subtypes — drives admin selects and browse cards. */
export const GOVERNANCE_SUBTYPES = governanceTaxonomy.subtypes;

export type GovernanceSubtype = keyof typeof governanceTaxonomy.subtypes | typeof EXCLUDED_SUBTYPE;

export const SSE_SUBTYPES = Object.keys(GOVERNANCE_SUBTYPES) as Array<
  keyof typeof GOVERNANCE_SUBTYPES
>;

export const VALID_SUBTYPES: readonly GovernanceSubtype[] = [...SSE_SUBTYPES, EXCLUDED_SUBTYPE];

export const VALID_CATEGORIES = Object.keys(GOVERNANCE_CATEGORIES) as GovernanceCategory[];

export const SUBTYPE_TO_CATEGORY: Record<GovernanceSubtype, GovernanceCategory> = {
  ...(Object.fromEntries(
    Object.entries(GOVERNANCE_SUBTYPES).map(([code, meta]) => [code, meta.category]),
  ) as Record<keyof typeof GOVERNANCE_SUBTYPES, GovernanceCategory>),
  [EXCLUDED_SUBTYPE]: EXCLUDED_CATEGORY,
};

export function categoryForSubtype(subtype: string | null | undefined): GovernanceCategory | null {
  if (!subtype) return null;
  return SUBTYPE_TO_CATEGORY[subtype as GovernanceSubtype] ?? null;
}

export function isGovernanceSubtype(value: string): value is GovernanceSubtype {
  return (VALID_SUBTYPES as readonly string[]).includes(value);
}

export function isGovernanceCategory(value: string): value is GovernanceCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(value);
}

/** Subtypes belonging to a parent category (empty for EXCLUDED). */
export function subtypesForCategory(
  category: GovernanceCategory,
): Array<keyof typeof GOVERNANCE_SUBTYPES> {
  if (category === EXCLUDED_CATEGORY) return [];
  return SSE_SUBTYPES.filter((code) => GOVERNANCE_SUBTYPES[code].category === category);
}

export interface GovernanceTaxonomyEntry {
  code?: string;
  category: string;
  label_en: string;
  label_fr: string;
  scope_note_en: string;
  scope_note_fr?: string;
}

/** Lookup canonical entry for a governance subtype directly from governance.json. */
export function getGovernanceEntry(
  subtype: string | null | undefined,
): GovernanceTaxonomyEntry | null {
  if (!subtype) return null;
  if (subtype === EXCLUDED_SUBTYPE) {
    return governanceTaxonomy.excluded as GovernanceTaxonomyEntry;
  }
  const entry = (governanceTaxonomy.subtypes as Record<string, GovernanceTaxonomyEntry>)[subtype];
  return entry ?? null;
}
