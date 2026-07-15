/** Product default posted window (URL/API/SSR/Clear/Suggested). */
export const PRODUCT_DEFAULT_POSTED_WITHIN = '2-weeks' as const;

export const BULLETIN_MAX_AGE_DAYS = 28;

export function bulletinAgeCutoffIso(): string {
  return new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
