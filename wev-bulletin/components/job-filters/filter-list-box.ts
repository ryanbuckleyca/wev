const FILTER_LIST_BOX_BASE =
  'overflow-y-auto border border-border rounded-wev-btn p-2 bg-background';

/** Shared list box so org (and matching job) filter sections align in the grid. */
export const FILTER_LIST_BOX_CLASS = `h-40 ${FILTER_LIST_BOX_BASE}`;

/** Shorter box for sections with only a few options (Activity, language). */
export const FILTER_LIST_BOX_COMPACT_CLASS = `h-32 ${FILTER_LIST_BOX_BASE}`;
