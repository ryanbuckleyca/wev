'use client';

import { useState, useEffect, useMemo } from 'react';
import type { OrgIndexEntry } from '@/lib/organizations/types';
import type { OrganizationFilterOptions } from '@/lib/organizations/server-data';
import type { OrganizationFilters } from './useOrganizationFilters';

interface UseOrganizationDataOptions {
  filters: OrganizationFilters;
  currentPage: number;
  sortBy: string;
}

/**
 * Builds a deterministic string key from the current fetch parameters.
 * Used to detect when a new request is needed and to deduplicate in-flight requests.
 */
function buildFetchKey(
  locale: string,
  currentPage: number,
  sortBy: string,
  filters: OrganizationFilters,
): string {
  return [
    locale,
    currentPage,
    sortBy,
    filters.searchQuery,
    filters.showNonSse,
    filters.selectedProvinces.join(','),
    filters.selectedMunicipalities.join(','),
    filters.selectedTypes.join(','),
    filters.selectedLanguages.join(','),
    filters.selectedSectors.join(','),
    filters.activityWindow,
  ].join('|');
}

/** Builds the URLSearchParams for the /api/organizations request. */
function buildSearchParams(
  locale: string,
  currentPage: number,
  sortBy: string,
  filters: OrganizationFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(currentPage));
  params.set('sortBy', sortBy);
  if (filters.searchQuery) params.set('q', filters.searchQuery);
  // nonSse=true means "show non-SSE orgs" — server interprets absence as SSE-only
  if (filters.showNonSse) params.set('nonSse', 'true');
  // Activity window: only set when not default ('all')
  if (filters.activityWindow !== 'all') params.set('activity', filters.activityWindow);
  // Param names must match useOrganizationFilters URL keys and the API route's getAll() keys
  filters.selectedProvinces.forEach((p) => params.append('province', p));
  filters.selectedMunicipalities.forEach((m) => params.append('municipality', m));
  filters.selectedTypes.forEach((t) => params.append('type', t));
  filters.selectedLanguages.forEach((l) => params.append('language', l));
  filters.selectedSectors.forEach((s) => params.append('sector', s));
  return params;
}

export function useOrganizationData(
  locale: string,
  options: UseOrganizationDataOptions,
  initialData?: {
    orgs: OrgIndexEntry[];
    total: number;
    totalAvailable?: number;
    filterOptions?: OrganizationFilterOptions;
  },
) {
  const { filters, currentPage, sortBy } = options;

  const [orgs, setOrgs] = useState<OrgIndexEntry[]>(() => initialData?.orgs ?? []);
  const [total, setTotal] = useState<number>(() => initialData?.total ?? 0);
  const [totalAvailable, setTotalAvailable] = useState<number>(
    () => initialData?.totalAvailable ?? initialData?.total ?? 0,
  );
  const [filterOptions, setFilterOptions] = useState<OrganizationFilterOptions | null>(
    () => initialData?.filterOptions ?? null,
  );
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  const fetchKey = useMemo(
    () => buildFetchKey(locale, currentPage, sortBy, filters),
    [locale, currentPage, sortBy, filters],
  );

  // Key of the data currently in state. Differs from fetchKey while a new
  // filter/page request is in flight — used so the list skeleton shows on the
  // same render as the URL change (before the effect runs).
  const [completedFetchKey, setCompletedFetchKey] = useState(() =>
    initialData ? buildFetchKey(locale, currentPage, sortBy, filters) : '',
  );

  useEffect(() => {
    if (fetchKey === completedFetchKey) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    async function fetchData() {
      setError(null);
      setLoading(true);

      try {
        const params = buildSearchParams(locale, currentPage, sortBy, filters);
        const res = await fetch(`/api/organizations?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) throw new Error('Failed to fetch organizations');

        const data = await res.json();
        setOrgs(data.orgs);
        setTotal(data.total);
        setTotalAvailable(data.totalAvailable ?? data.total);
        if (data.filterOptions) setFilterOptions(data.filterOptions);
        setCompletedFetchKey(fetchKey);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        // Settle this fetchKey even on failure so isStale clears (same as bulletin).
        setCompletedFetchKey(fetchKey);
      } finally {
        clearTimeout(timeoutId);
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void fetchData();
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fetchKey, completedFetchKey, locale, currentPage, sortBy, filters]);

  const isStale = completedFetchKey !== fetchKey;
  return {
    orgs,
    total,
    totalAvailable,
    filterOptions,
    loading: loading || isStale,
    error,
  };
}
