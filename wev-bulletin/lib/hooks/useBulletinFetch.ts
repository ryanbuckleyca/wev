'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { formatLastScrapeTime } from '@/lib/bulletin/client-data';
import type { JobPosting } from '@/lib/supabase';
import type { BulletinFilters, JobSortOption } from '@/lib/bulletin/types';
import type { InitialBulletinData, SkillLabel } from '@/lib/bulletin/types';
import type { BulletinFilterOptions } from '@/lib/bulletin/server-data';

const FETCH_TIMEOUT_MS = 10_000;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Serialise BulletinFilters + sort/page into URL search params for /api/bulletin.
 */
function buildQueryString(
  locale: string,
  filters: BulletinFilters,
  sortBy: JobSortOption,
  page: number,
): string {
  const params = new URLSearchParams();
  params.set('locale', locale);
  params.set('page', String(page));
  params.set('sort', sortBy);

  if (filters.searchQuery) params.set('q', filters.searchQuery);
  if (filters.selectedOrganizations.length > 0)
    params.set('org', filters.selectedOrganizations.join(','));
  if (filters.selectedProvinces.length > 0)
    params.set('province', filters.selectedProvinces.join(','));
  if (filters.selectedMunicipalities.length > 0)
    params.set('municipality', filters.selectedMunicipalities.join(','));
  if (filters.selectedEmploymentTypes.length > 0)
    params.set('employment', filters.selectedEmploymentTypes.join(','));
  if (filters.selectedSources.length > 0) params.set('source', filters.selectedSources.join(','));
  if (filters.selectedWorkTypes.length > 0)
    params.set('workType', filters.selectedWorkTypes.join(','));

  // Only include booleans when they differ from the API defaults
  if (!filters.showOnlySse) params.set('sse', 'false');
  if (!filters.showJobsWithoutSalary) params.set('salary', 'false');
  if (filters.postedWithin && filters.postedWithin !== 'any')
    params.set('posted', filters.postedWithin);

  return params.toString();
}

export function useBulletinFetch(
  locale: string,
  filters: BulletinFilters,
  sortBy: JobSortOption,
  currentPage: number,
  initialData?: InitialBulletinData,
) {
  const t = useTranslations('home.errors');
  const requestIdRef = useRef(0);

  const [paginatedJobs, setPaginatedJobs] = useState<JobPosting[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(() =>
    initialData?.scrapeTime ? formatLastScrapeTime(initialData.scrapeTime, locale) : null,
  );
  const [skillLabels, setSkillLabels] = useState<Record<string, SkillLabel>>(
    () => initialData?.skillLabels ?? {},
  );
  const [filterOptions, setFilterOptions] = useState<BulletinFilterOptions | null>(
    () => initialData?.filterOptions ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(
    async (overrideFilters?: BulletinFilters, overridePage?: number) => {
      const activeFilters = overrideFilters ?? filters;
      const activePage = overridePage ?? currentPage;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const qs = buildQueryString(locale, activeFilters, sortBy, activePage);
        const response = await fetch(`/api/bulletin?${qs}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? t('loadFailed'));
        }

        const data = await response.json();
        if (requestId !== requestIdRef.current) return;

        setPaginatedJobs(data.jobs ?? []);
        setTotalCount(data.totalCount ?? 0);
        if (data.lastScrapeTime) {
          setLastScrapeTime(formatLastScrapeTime(data.lastScrapeTime, locale));
        }
        if (data.skillLabels) {
          setSkillLabels(data.skillLabels);
        }
        if (data.filterOptions) {
          setFilterOptions(data.filterOptions);
        }
        setLoading(false);
      } catch (fetchError) {
        if (requestId !== requestIdRef.current) return;
        console.error('Error fetching bulletin data:', fetchError);

        let message = t('loadFailed');
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
          message = t('timeout');
        } else if (fetchError instanceof Error) {
          message = fetchError.message;
        }

        setError(message);
        setLoading(false);
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [locale, filters, sortBy, currentPage, t],
  );

  // Debounced refetch on search query changes, immediate refetch for other changes
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFiltersRef = useRef<string>('');
  const initialFetchDone = useRef(false);

  useEffect(() => {
    const filtersKey = JSON.stringify({ filters, sortBy, currentPage });

    // Skip if nothing changed (e.g. re-render without actual state change)
    if (prevFiltersRef.current === filtersKey && initialFetchDone.current) return;

    const prevKey = prevFiltersRef.current;
    prevFiltersRef.current = filtersKey;

    // Determine if only the search query changed (for debouncing)
    const onlySearchChanged =
      initialFetchDone.current &&
      prevKey &&
      (() => {
        try {
          const prev = JSON.parse(prevKey);
          const curr = JSON.parse(filtersKey);
          const prevWithoutSearch = { ...prev, filters: { ...prev.filters, searchQuery: '' } };
          const currWithoutSearch = { ...curr, filters: { ...curr.filters, searchQuery: '' } };
          return JSON.stringify(prevWithoutSearch) === JSON.stringify(currWithoutSearch);
        } catch {
          return false;
        }
      })();

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    if (onlySearchChanged) {
      searchDebounceRef.current = setTimeout(() => {
        void fetchJobs();
      }, SEARCH_DEBOUNCE_MS);
    } else {
      initialFetchDone.current = true;
      void fetchJobs();
    }

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [filters, sortBy, currentPage, fetchJobs]);

  const refresh = useCallback(async () => {
    await fetchJobs();
  }, [fetchJobs]);

  return {
    paginatedJobs,
    setPaginatedJobs,
    totalCount,
    lastScrapeTime,
    skillLabels,
    setSkillLabels,
    filterOptions,
    setFilterOptions,
    loading,
    error,
    refresh,
  };
}
