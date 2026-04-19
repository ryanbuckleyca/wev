/**
 * Central constants for the bulletin module.
 */

/** Number of jobs displayed per page in the bulletin listings. */
export const BULLETIN_ITEMS_PER_PAGE = 20;

/** Jobs older than this are never shown in the bulletin. */
export const BULLETIN_MAX_AGE_DAYS = 28;

/** Default sort option for the bulletin. */
export const BULLETIN_DEFAULT_SORT = 'date-desc' as const;

/** Timeout for client-side bulletin fetch requests. */
export const BULLETIN_FETCH_TIMEOUT_MS = 10_000;

/** Debounce delay for search query inputs. */
export const BULLETIN_SEARCH_DEBOUNCE_MS = 300;
