/** Product default posted window (URL/API/SSR/Clear/Suggested). */
export const PRODUCT_DEFAULT_POSTED_WITHIN = '2-weeks' as const;

/** Hard ceiling: jobs older than this never appear, regardless of postedWithin. */
export const BULLETIN_MAX_AGE_DAYS = 28;

/**
 * Day count for each finite posted-within window. `'any'` has no entry.
 * Single source of truth for both the server age filter and client-side
 * `filterJobs`; values are clamped to {@link BULLETIN_MAX_AGE_DAYS} at use.
 */
export const POSTED_WITHIN_DAYS = {
  '1-week': 7,
  '2-weeks': 14,
  '3-weeks': 21,
  '1-month': 28,
} as const;

export const PRODUCT_DEFAULT_POSTED_WITHIN_DAYS =
  POSTED_WITHIN_DAYS[PRODUCT_DEFAULT_POSTED_WITHIN];

export function bulletinAgeCutoffIso(): string {
  return new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
