/**
 * Helpers for the organization assessment review queue.
 *
 * The scraper parks an organization by writing `assessment_skip_reason` when an
 * assessment attempt fails to complete it. A parked org is never re-assessed
 * until the reason is cleared, so these helpers decide when an admin edit earns
 * the org another attempt.
 *
 * Keep `isOrgAssessmentComplete` in sync with `find_missing_org_fields` in
 * wev-scraper/utils/catch_up.py.
 */

import { ORG_LANGUAGES } from './constants';

/** Parked and hidden from the default Needs review filter. */
export const ORG_SKIP_REASON_IGNORED = 'ignored';

const VALID_ORG_LANGUAGES = new Set<string>(ORG_LANGUAGES);

/** Fields that decide whether an org still needs assessment. */
export interface OrgAssessmentSnapshot {
  sector_id?: string | null;
  type?: string | null;
  description?: string | null;
  description_en?: string | null;
  description_fr?: string | null;
  language?: string | null;
  values_list?: string[] | null;
}

/**
 * Which assessed fields an org is still missing, in form order.
 *
 * Drives both the completeness check and the review banner, so the reason an
 * org is parked always matches what the banner tells the admin to fix.
 */
export type OrgMissingField =
  | 'sector'
  | 'type'
  | 'descriptionEn'
  | 'descriptionFr'
  | 'language'
  | 'values';

/** Assessed fields in form / checklist order. */
export const ORG_ASSESSMENT_FIELDS: readonly OrgMissingField[] = [
  'sector',
  'type',
  'descriptionEn',
  'descriptionFr',
  'language',
  'values',
] as const;

export function findMissingOrgFields(org: OrgAssessmentSnapshot): OrgMissingField[] {
  const missing: OrgMissingField[] = [];
  if (!org.sector_id?.trim()) missing.push('sector');
  if (!org.type?.trim()) missing.push('type');
  // description_en falls back to the legacy description column, as the scraper does.
  if (!(org.description_en?.trim() || org.description?.trim())) missing.push('descriptionEn');
  if (!org.description_fr?.trim()) missing.push('descriptionFr');
  if (!org.language || !VALID_ORG_LANGUAGES.has(org.language)) missing.push('language');
  if (!org.values_list?.length) missing.push('values');
  return missing;
}

export function isOrgAssessmentComplete(org: OrgAssessmentSnapshot): boolean {
  return findMissingOrgFields(org).length === 0;
}

/**
 * Fields that change who the organization *is*, and therefore change what the
 * assessor would search for. Editing these is the fix path for a
 * `location_mismatch` park.
 */
export const ORG_IDENTITY_FIELDS = [
  'name',
  'website',
  'municipality',
  'province',
  'location',
] as const;

function normalizeIdentityValue(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value);
  return value.trim() || null;
}

/**
 * True when an identity field is present in *updates* with a different
 * non-empty value.
 *
 * Compares values rather than key presence: the admin form submits the whole
 * location group on every save, so key presence alone would treat every
 * cosmetic edit as an identity change.
 *
 * A change *to* null/blank does not count. The form sends municipality and
 * province as null whenever the picker has no coordinates, which would
 * otherwise unpark every incomplete org that has a city name but no lat/lng.
 * Clearing a website is also not a corrected identity — Retry is the path
 * for "try again with less information."
 */
export function identityFieldsChanged(
  existing: Record<string, unknown>,
  updates: Record<string, unknown>,
): boolean {
  return ORG_IDENTITY_FIELDS.some((field) => {
    if (!(field in updates)) return false;
    const next = normalizeIdentityValue(updates[field]);
    if (next == null) return false;
    return next !== normalizeIdentityValue(existing[field]);
  });
}

/**
 * What to write to `assessment_skip_reason` after an admin save.
 *
 * Returns `null` to clear the reason (unparking the org) or `undefined` to leave
 * the column untouched.
 */
export function resolveSkipReasonAfterSave({
  previousReason,
  merged,
  identityChanged,
}: {
  previousReason: string | null | undefined;
  merged: OrgAssessmentSnapshot;
  identityChanged: boolean;
}): null | undefined {
  if (previousReason == null) return undefined;

  // Complete orgs are never queued, so a leftover reason is just misleading.
  if (isOrgAssessmentComplete(merged)) return null;

  // An explicit Ignore outranks an incidental identity edit; the admin can still
  // press Retry to bring the org back.
  if (previousReason === ORG_SKIP_REASON_IGNORED) return undefined;

  // Corrected identity means the next attempt has new information to work with.
  if (identityChanged) return null;

  return undefined;
}
