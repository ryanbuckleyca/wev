'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { formatLastScrapeTime } from '@/lib/bulletin/client-data';
import {
  BULLETIN_FETCH_TIMEOUT_MS,
  BULLETIN_SEARCH_DEBOUNCE_MS,
} from '@/lib/bulletin/constants';
import type { JobPosting } from '@/lib/supabase';
import type { BulletinFilters, JobSortOption } from '@/lib/bulletin/types';
import type { InitialBulletinData, SkillLabel } from '@/lib/bulletin/types';
import type { BulletinFilterOptions } from '@/lib/bulletin/server-data';

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

  const { searchQuery, ...arrays } = filters;
  if (searchQuery) params.set('q', searchQuery);

  const keyMap: Record<string, string> = {
    selectedOrganizations: 'org',
    selectedProvinces: 'province',
    selectedMunicipalities: 'municipality',
    selectedEmploymentTypes: 'employment',
    selectedSources: 'source',
    selectedWorkTypes: 'workType',
  };

  for (const [filterKey, paramKey] of Object.entries(keyMap)) {
    const values = (arrays as any)[filterKey];
    if (Array.isArray(values) && values.length > 0) {
      params.set(paramKey, values.join(','));
    }
  }

  if (!filters.showOnlySse) params.set('sse', 'false');
  if (!filters.showJobsWithoutSalary) params.set('salary', 'false');
  if (filters.postedWithin && filters.postedWithin !== 'any') {
    params.set('posted', filters.postedWithin);
  }

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

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), BULLETIN_FETCH_TIMEOUT_MS);

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

  // Debounce search query changes; execute other filter/sort changes immediately.
  const { searchQuery, ...otherFilters } = filters;
  const otherStateKey = useMemo(
    () => JSON.stringify({ otherFilters, sortBy, currentPage }),
    [otherFilters, sortBy, currentPage],
  );

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const lastKeyRef = useRef(otherStateKey);

  useEffect(() => {
    // Determine if we should debounce (only query changed) or fetch immediately
    const stateChanged = lastKeyRef.current !== otherStateKey;
    lastKeyRef.current = otherStateKey;

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    // Skip the very first render to avoid double-fetching (Server Component already provided initialData)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (stateChanged) {
      void fetchJobs();
    } else {
      // Only search query changed
      searchDebounceRef.current = setTimeout(() => {
        void fetchJobs();
      }, BULLETIN_SEARCH_DEBOUNCE_MS);
    }

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, otherStateKey, fetchJobs]);

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
