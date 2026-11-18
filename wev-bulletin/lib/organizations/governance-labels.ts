import {
  EXCLUDED_CATEGORY,
  EXCLUDED_SUBTYPE,
  GOVERNANCE_CATEGORIES,
  GOVERNANCE_SUBTYPES,
  categoryForSubtype,
  isGovernanceCategory,
  isGovernanceSubtype,
  type GovernanceCategory,
  type GovernanceSubtype,
} from './governance-taxonomy';

type OrgTranslator = { (key: string): string; has: (key: string) => boolean };

/** Prefer i18n; fall back to the English taxonomy label. */
export function getGovernanceCategoryLabel(
  category: string | null | undefined,
  t: OrgTranslator,
): string | null {
  if (!category || !isGovernanceCategory(category)) return null;
  const key = `governance.category.${category}`;
  if (t.has(key)) return t(key);
  return GOVERNANCE_CATEGORIES[category].label_en;
}

/** Prefer i18n; fall back to the English taxonomy label. */
export function getGovernanceSubtypeLabel(
  subtype: string | null | undefined,
  t: OrgTranslator,
): string | null {
  if (!subtype || !isGovernanceSubtype(subtype)) return null;
  const key = `governance.subtype.${subtype}`;
  if (t.has(key)) return t(key);
  if (subtype === EXCLUDED_SUBTYPE) {
    return GOVERNANCE_CATEGORIES[EXCLUDED_CATEGORY].label_en;
  }
  return GOVERNANCE_SUBTYPES[subtype as keyof typeof GOVERNANCE_SUBTYPES].label_en;
}

/**
 * True when the subtype is a public SSE governance form (not unset / EXCLUDED).
 * Non-SSE rows store EXCLUDED_NON_SSE and have no public governance label.
 */
export function hasPublicGovernanceSubtype(
  subtype: string | null | undefined,
): boolean {
  return (
    typeof subtype === 'string' &&
    isGovernanceSubtype(subtype) &&
    subtype !== EXCLUDED_SUBTYPE
  );
}

/**
 * Display label for an org's governance form (subtype when publicly classifiable).
 */
export function getOrgGovernanceDisplayLabel(
  org: {
    governance_subtype?: string | null;
  },
  t: OrgTranslator,
): string | null {
  if (hasPublicGovernanceSubtype(org.governance_subtype)) {
    return getGovernanceSubtypeLabel(org.governance_subtype, t);
  }
  return null;
}

export function resolveGovernanceForSave(input: {
  governance_subtype?: string | null;
  is_sse?: boolean;
}): {
  governance_subtype: GovernanceSubtype | null;
  governance_category: GovernanceCategory | null;
} {
  if (input.is_sse === false) {
    return {
      governance_subtype: EXCLUDED_SUBTYPE,
      governance_category: EXCLUDED_CATEGORY,
    };
  }
  const raw = input.governance_subtype?.trim() || null;
  if (!raw || !isGovernanceSubtype(raw) || raw === EXCLUDED_SUBTYPE) {
    return { governance_subtype: null, governance_category: null };
  }
  return {
    governance_subtype: raw,
    governance_category: categoryForSubtype(raw),
  };
}
