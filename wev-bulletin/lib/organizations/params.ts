/**
 * Shared query-parameter parsing for the organizations index.
 *
 * Used by both the server page (`app/[locale]/organizations/page.tsx`) and
 * the API route (`app/api/organizations/route.ts`) so the two stay in sync.
 */

import { resolveOrgSortBy } from './utils';

export interface OrgIndexParams {
  page: number;
  searchQuery: string;
  sseOnly: boolean;
  provinces: string[];
  municipalities: string[];
  orgTypes: string[];
  languages: string[];
  sortBy: string;
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

  return {
    page,
    searchQuery,
    sseOnly,
    provinces,
    municipalities,
    orgTypes,
    languages,
    sortBy,
  };
}
