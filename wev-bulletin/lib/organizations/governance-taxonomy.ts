/**
 * Canadian SSE governance taxonomy (single-axis, 2-level).
 *
 * Mirror of wev-scraper/utils/governance_taxonomy.py — keep codes and
 * GOVERNANCE_TAXONOMY_VERSION in sync when the taxonomy changes. Category is
 * always derived from subtype; never invent a category independently.
 */

export const GOVERNANCE_TAXONOMY_VERSION = 'v1.1';

export const EXCLUDED_CATEGORY = 'EXCLUDED' as const;
export const EXCLUDED_SUBTYPE = 'EXCLUDED_NON_SSE' as const;

export const GOVERNANCE_CATEGORIES = {
  GOV_1: {
    label_en: 'Democratic Member-Owned Cooperatives',
    label_fr: 'Coopératives démocratiques à propriété collective',
  },
  GOV_2: {
    label_en: 'Mutual Benefit & Financial Institutions',
    label_fr: 'Mutuelles et institutions financières',
  },
  GOV_3: {
    label_en: 'Collective Asset Stewardship & Land Trusts',
    label_fr: 'Fiducies foncières et gestion d\'actifs collectifs',
  },
  GOV_4: {
    label_en: 'Participatory Non-Profits & Social Enterprises',
    label_fr: 'OBNL participatifs et entreprises sociales',
  },
  GOV_5: {
    label_en: 'Grassroots & Popular Economy Collectives',
    label_fr: 'Collectifs de l\'économie populaire et de terrain',
  },
  [EXCLUDED_CATEGORY]: {
    label_en: 'Excluded (non-SSE)',
    label_fr: 'Exclu (hors ÉSS)',
  },
} as const;

export type GovernanceCategory = keyof typeof GOVERNANCE_CATEGORIES;

/** Ordered SSE subtypes — drives admin selects and browse cards. */
export const GOVERNANCE_SUBTYPES = {
  GOV_1_1_WORKER_COOP: {
    category: 'GOV_1',
    label_en: 'Worker Cooperative',
    label_fr: 'Coopérative de travail',
  },
  GOV_1_2_CONSUMER_COOP: {
    category: 'GOV_1',
    label_en: 'Consumer / Customer Cooperative',
    label_fr: 'Coopérative de consommateurs',
  },
  GOV_1_3_PRODUCER_COOP: {
    category: 'GOV_1',
    label_en: 'Producer / Supplier Cooperative',
    label_fr: 'Coopérative de producteurs',
  },
  GOV_1_4_SOLIDARITY_COOP: {
    category: 'GOV_1',
    label_en: 'Multi-Stakeholder / Solidarity Cooperative',
    label_fr: 'Coopérative de solidarité',
  },
  GOV_2_1_CREDIT_UNION: {
    category: 'GOV_2',
    label_en: 'Credit Union / Caisse Populaire',
    label_fr: 'Caisse populaire / Credit union',
  },
  GOV_2_2_MUTUAL_INSURANCE: {
    category: 'GOV_2',
    label_en: 'Mutual Insurance Society',
    label_fr: 'Société mutuelle d\'assurance',
  },
  GOV_3_1_COMMUNITY_LAND_TRUST: {
    category: 'GOV_3',
    label_en: 'Community Land Trust (CLT)',
    label_fr: 'Fiducie foncière communautaire',
  },
  GOV_3_2_INDIGENOUS_LAND_TRUST: {
    category: 'GOV_3',
    label_en: 'Indigenous & Sovereign Land Trust',
    label_fr: 'Fiducie foncière autochtone et souveraine',
  },
  GOV_4_1_MEMBER_NPO: {
    category: 'GOV_4',
    label_en: 'Member-Governed Non-Profit',
    label_fr: 'Organisme sans but lucratif (OBNL)',
  },
  GOV_4_2_WISE: {
    category: 'GOV_4',
    label_en: 'Work Integration Social Enterprise',
    label_fr: "Entreprise d'insertion (WISE)",
  },
  GOV_4_3_COMMUNITY_DEV_CORP: {
    category: 'GOV_4',
    label_en: 'Community Development Corporation',
    label_fr: 'Corporation de développement (CDEC)',
  },
  GOV_5_1_MUTUAL_AID: {
    category: 'GOV_5',
    label_en: 'Mutual Aid Network',
    label_fr: "Réseau d'entraide mutuelle",
  },
  GOV_5_2_POPULAR_COLLECTIVE: {
    category: 'GOV_5',
    label_en: 'Popular Economy Collective',
    label_fr: "Collectif d'économie populaire",
  },
  GOV_5_3_DEMOCRATIC_UNION: {
    category: 'GOV_5',
    label_en: 'Democratic Labor Union Local',
    label_fr: 'Syndicat démocratique local',
  },
} as const;

export type GovernanceSubtype = keyof typeof GOVERNANCE_SUBTYPES | typeof EXCLUDED_SUBTYPE;

export const SSE_SUBTYPES = Object.keys(GOVERNANCE_SUBTYPES) as Array<
  keyof typeof GOVERNANCE_SUBTYPES
>;

export const VALID_SUBTYPES: readonly GovernanceSubtype[] = [
  ...SSE_SUBTYPES,
  EXCLUDED_SUBTYPE,
];

export const VALID_CATEGORIES = Object.keys(
  GOVERNANCE_CATEGORIES,
) as GovernanceCategory[];

export const SUBTYPE_TO_CATEGORY: Record<GovernanceSubtype, GovernanceCategory> = {
  ...(Object.fromEntries(
    Object.entries(GOVERNANCE_SUBTYPES).map(([code, meta]) => [code, meta.category]),
  ) as Record<keyof typeof GOVERNANCE_SUBTYPES, GovernanceCategory>),
  [EXCLUDED_SUBTYPE]: EXCLUDED_CATEGORY,
};

export function categoryForSubtype(
  subtype: string | null | undefined,
): GovernanceCategory | null {
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
