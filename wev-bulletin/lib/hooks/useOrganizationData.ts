'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { OrgIndexEntry } from '@/lib/organizations/types';
import type { OrganizationFilters } from './useOrganizationFilters';

interface UseOrganizationDataOptions {
  filters: OrganizationFilters;
  currentPage: number;
  sortBy: string;
}

export function useOrganizationData(
  locale: string,
  options: UseOrganizationDataOptions,
  initialData?: { orgs: OrgIndexEntry[]; total: number; totalAvailable?: number },
) {
  const { filters, currentPage, sortBy } = options;

  const [orgs, setOrgs] = useState<OrgIndexEntry[]>(() => initialData?.orgs ?? []);
  const [total, setTotal] = useState<number>(() => initialData?.total ?? 0);
  const [totalAvailable, setTotalAvailable] = useState<number>(
    () => initialData?.totalAvailable ?? initialData?.total ?? 0,
  );
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const isMounted = useRef(false);

  const fetchKey = useMemo(() => {
    return [
      locale,
      currentPage,
      filters.searchQuery,
      filters.showOnlySse,
      filters.selectedProvinces.join(','),
      filters.selectedMunicipalities.join(','),
      filters.selectedTypes.join(','),
      sortBy
    ].join('|');
  }, [locale, currentPage, filters, sortBy]);

  const lastFetchKey = useRef<string>(initialData ? fetchKey : '');

  const fetchData = useCallback(async () => {
    if (fetchKey === lastFetchKey.current && isMounted.current) return;
    lastFetchKey.current = fetchKey;

    const reqId = ++requestIdRef.current;
    
    if (orgs.length === 0) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('sortBy', sortBy);
      if (filters.searchQuery) params.set('q', filters.searchQuery);
      if (filters.showOnlySse) params.set('sse', 'true');
      filters.selectedProvinces.forEach((p) => params.append('provs', p));
      filters.selectedMunicipalities.forEach((m) => params.append('munis', m));
      filters.selectedTypes.forEach((t) => params.append('types', t));

      const res = await fetch(`/api/organizations?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch organizations');
      }

      const data = await res.json();
      if (reqId === requestIdRef.current) {
        setOrgs(data.orgs);
        setTotal(data.total);
        setTotalAvailable(data.totalAvailable ?? data.total);
        setLoading(false);
      }
    } catch (err) {
      if (reqId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    }
  }, [fetchKey, currentPage, filters, sortBy, orgs.length]);

  useEffect(() => {
    isMounted.current = true;
    if (fetchKey !== lastFetchKey.current || !initialData) {
      void fetchData();
    }
  }, [fetchData, fetchKey, initialData]);

  return { orgs, total, totalAvailable, loading, error };
}
