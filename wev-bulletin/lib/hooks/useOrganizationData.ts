'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
    filters.selectedProvinces.join(','),
    filters.selectedMunicipalities.join(','),
    filters.selectedTypes.join(','),
    filters.selectedLanguages.join(','),
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
  // Activity window: only set when not default ('all')
  if (filters.activityWindow !== 'all') params.set('activity', filters.activityWindow);
  // Param names must match useOrganizationFilters URL keys and the API route's getAll() keys
  filters.selectedProvinces.forEach((p) => params.append('province', p));
  filters.selectedMunicipalities.forEach((m) => params.append('municipality', m));
  filters.selectedTypes.forEach((t) => params.append('type', t));
  filters.selectedLanguages.forEach((l) => params.append('language', l));
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

  // Ref to track whether we have any data loaded — used to decide whether to
  // show the full skeleton spinner. Avoids stale-closure reads of `orgs`.
  const hasDataRef = useRef(Boolean(initialData?.orgs?.length));

  const fetchKey = useMemo(
    () => buildFetchKey(locale, currentPage, sortBy, filters),
    [locale, currentPage, sortBy, filters],
  );

  // Track which fetchKey was last dispatched so we can skip the initial render
  // when initialData already matches the current key.
  const lastFetchKey = useRef<string>(initialData ? fetchKey : '');

  useEffect(() => {
    if (fetchKey === lastFetchKey.current) return;
    lastFetchKey.current = fetchKey;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    async function fetchData() {
      setError(null);
      // Only show the full-page skeleton when no data is loaded yet.
      if (!hasDataRef.current) setLoading(true);

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
        hasDataRef.current = true;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unknown error');
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
  }, [fetchKey, locale, currentPage, sortBy, filters]);

  return { orgs, total, totalAvailable, filterOptions, loading, error };
}
