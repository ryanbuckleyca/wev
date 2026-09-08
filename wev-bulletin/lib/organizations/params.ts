/**
 * Shared query-parameter parsing for the organizations index.
 *
 * Used by both the server page (`app/[locale]/organizations/page.tsx`) and
 * the API route (`app/api/organizations/route.ts`) so the two stay in sync.
 */

import { resolveOrgSortBy } from './utils';

/** Activity window values synced between URL, client hooks, and server. */
export type ActivityWindow = 'all' | '28d' | '90d';

const ACTIVITY_DAYS: Record<ActivityWindow, number | null> = {
  all: null,
  '28d': 28,
  '90d': 90,
};

/** Map an ActivityWindow string to an activityDays number (or null for all). */
export function activityWindowToDays(window: ActivityWindow): number | null {
  return ACTIVITY_DAYS[window] ?? null;
}

/** Parse the raw `activity` query param into a validated ActivityWindow value. */
export function parseActivityWindow(raw: string | null | undefined): ActivityWindow {
  if (raw === '28d' || raw === '90d') return raw;
  return 'all';
}

/**
 * Org detail jobs list: default to the 28-day (active) window so older postings
 * stay opt-in via `?activity=90d` or `?activity=all`.
 */
export function parseOrgJobsActivityWindow(raw: string | null | undefined): ActivityWindow {
  if (raw === 'all' || raw === '90d' || raw === '28d') return raw;
  return '28d';
}

export interface OrgIndexParams {
  page: number;
  searchQuery: string;
  sseOnly: boolean;
  provinces: string[];
  municipalities: string[];
  orgTypes: string[];
  languages: string[];
  sectors: string[];
  sortBy: string;
  activityWindow: ActivityWindow;
  activityDays: number | null;
}

/**
 * Parse raw URLSearchParams (from `new URL(req.url).searchParams`) into typed
 * org-index params. Requires the auth-resolved `hasMatchScores` flag so sort
 * can fall back gracefully for logged-out users.
 */
export function parseOrgIndexSearchParams(
  searchParams: URLSearchParams,
  hasMatchScores: boolean,
): OrgIndexParams {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const searchQuery = searchParams.get('q') ?? '';
  // nonSse=true means "include non-SSE orgs"; absence means SSE-only (the default view).
  const sseOnly = searchParams.get('nonSse') !== 'true';
  const requestedSortBy =
    searchParams.get('sortBy') ?? (hasMatchScores ? 'value-match-desc' : 'org-asc');
  const sortBy = resolveOrgSortBy(requestedSortBy, hasMatchScores);
  const provinces = searchParams.getAll('province');
  const municipalities = searchParams.getAll('municipality');
  const orgTypes = searchParams.getAll('type');
  const languages = searchParams.getAll('language');
  const sectors = searchParams.getAll('sector');
  const activityWindow = parseActivityWindow(searchParams.get('activity'));
  const activityDays = activityWindowToDays(activityWindow);

  return {
    page,
    searchQuery,
    sseOnly,
    provinces,
    municipalities,
    orgTypes,
    languages,
    sectors,
    sortBy,
    activityWindow,
    activityDays,
  };
}
