import { BULLETIN_MAX_AGE_DAYS, POSTED_WITHIN_DAYS, bulletinAgeCutoffIso } from './constants';

/**
 * Pure PostgREST query builders for the bulletin age + availability windows.
 * Kept out of the `server-only` data module so they stay unit-testable and
 * reusable from any runtime.
 */

/**
 * Days for a finite posted-within window, clamped to the hard ceiling.
 * Returns null for `'any'` / unknown values (no additional window applied).
 */
export function postedWithinToDays(postedWithin: string): number | null {
  const days = (POSTED_WITHIN_DAYS as Record<string, number>)[postedWithin];
  if (days == null) return null;
  return Math.min(days, BULLETIN_MAX_AGE_DAYS);
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Hard {@link BULLETIN_MAX_AGE_DAYS} ceiling + optional tighter postedWithin window. */
export function applyBulletinAgeFilter(query: any, postedWithin: string) {
  query = query.gte('date_posted', bulletinAgeCutoffIso());

  const postedWithinDays = postedWithinToDays(postedWithin);
  if (postedWithinDays != null) {
    query = query.gte('date_posted', daysAgoIso(postedWithinDays));
  }
  return query;
}

/**
 * Product baseline for the "available" job universe: SSE scope + listed pay.
 * `includeUnlistedPay` opts back into jobs without a wage / min_value.
 * (Age cutoff is applied separately via {@link applyBulletinAgeFilter}.)
 */
export function applyBulletinAvailabilityFilters(
  query: any,
  opts: { onlySse: boolean; includeUnlistedPay: boolean },
) {
  if (opts.onlySse) query = query.is('is_sse', true);
  if (!opts.includeUnlistedPay) query = query.eq('has_compensation', true);
  return query;
}
