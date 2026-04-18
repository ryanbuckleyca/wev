'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { formatLastScrapeTime } from '@/lib/bulletin/client-data';
import {
  BULLETIN_ITEMS_PER_PAGE,
  type BulletinFilters,
  type JobSortOption,
} from '@/lib/bulletin/job-query';
import type { JobPosting } from '@/lib/supabase';
import type { InitialBulletinData, SkillLabel } from '@/lib/bulletin/types';
import type { BulletinFilterOptions } from '@/lib/bulletin/filter-options';

const FETCH_TIMEOUT_MS = 10_000;
const SEARCH_DEBOUNCE_MS = 250;

const EMPTY_FILTER_OPTIONS: BulletinFilterOptions = {
  organizations: [],
  provinces: [],
  municipalitiesByProvince: {},
  employmentTypes: [],
  sources: [],
};

interface BulletinRequestState {
  filters: BulletinFilters;
  sortBy: JobSortOption;
  currentPage: number;
}

interface BulletinApiPayload {
  jobs?: JobPosting[];
  lastScrapeTime?: string | null;
  skillLabels?: Record<string, SkillLabel>;
  filteredJobsCount?: number;
  totalJobsCount?: number;
  totalPages?: number;
  currentPage?: number;
  filterOptions?: BulletinFilterOptions;
}

function appendStringArray(params: URLSearchParams, key: string, values: string[]) {
  values.forEach((value) => {
    if (value.length > 0) {
      params.append(key, value);
    }
  });
}

export function buildBulletinQueryString({
  locale,
  request,
  includeAllFilteredJobs = false,
}: {
  locale: string;
  request: BulletinRequestState;
  includeAllFilteredJobs?: boolean;
}) {
  const { filters, sortBy, currentPage } = request;
  const params = new URLSearchParams();

  params.set('locale', locale);
  params.set('page', String(currentPage));
  params.set('sort', sortBy);
  params.set('sse', String(filters.showOnlySse));
  params.set('salary', String(filters.showJobsWithoutSalary));
  params.set('posted', filters.postedWithin);

  if (filters.searchQuery.trim().length > 0) {
    params.set('q', filters.searchQuery.trim());
  }

  appendStringArray(params, 'org', filters.selectedOrganizations);
  appendStringArray(params, 'province', filters.selectedProvinces);
  appendStringArray(params, 'municipality', filters.selectedMunicipalities);
  appendStringArray(params, 'employment', filters.selectedEmploymentTypes);
  appendStringArray(params, 'source', filters.selectedSources);
  appendStringArray(params, 'workType', filters.selectedWorkTypes);

  if (includeAllFilteredJobs) {
    params.set('all', 'true');
  }

  return params.toString();
}

export function useBulletinFetch(
  locale: string,
  request: BulletinRequestState,
  initialData?: InitialBulletinData,
  onResolvedPage?: (page: number) => Promise<unknown> | void,
) {
  const t = useTranslations('home.errors');
  const requestIdRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(request.filters.searchQuery);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(request.filters.searchQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [request.filters.searchQuery]);

  const effectiveRequest = useMemo<BulletinRequestState>(
    () => ({
      currentPage: request.currentPage,
      sortBy: request.sortBy,
      filters: {
        postedWithin: request.filters.postedWithin,
        searchQuery: debouncedSearchQuery,
        selectedEmploymentTypes: request.filters.selectedEmploymentTypes,
        selectedMunicipalities: request.filters.selectedMunicipalities,
        selectedOrganizations: request.filters.selectedOrganizations,
        selectedProvinces: request.filters.selectedProvinces,
        selectedSources: request.filters.selectedSources,
        selectedWorkTypes: request.filters.selectedWorkTypes,
        showJobsWithoutSalary: request.filters.showJobsWithoutSalary,
        showOnlySse: request.filters.showOnlySse,
      },
    }),
    [
      debouncedSearchQuery,
      request.currentPage,
      request.sortBy,
      request.filters.postedWithin,
      request.filters.showJobsWithoutSalary,
      request.filters.showOnlySse,
      request.filters.selectedEmploymentTypes,
      request.filters.selectedMunicipalities,
      request.filters.selectedOrganizations,
      request.filters.selectedProvinces,
      request.filters.selectedSources,
      request.filters.selectedWorkTypes,
    ],
  );

  const hasInitialRenderData = Array.isArray(initialData?.jobs);

  const [allJobs, setAllJobs] = useState<JobPosting[]>(() => initialData?.jobs ?? []);
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(() =>
    initialData?.scrapeTime ? formatLastScrapeTime(initialData.scrapeTime, locale) : null,
  );
  const [skillLabels, setSkillLabels] = useState<Record<string, SkillLabel>>(
    () => initialData?.skillLabels ?? {},
  );
  const [filteredJobsCount, setFilteredJobsCount] = useState<number>(
    () => initialData?.filteredJobsCount ?? initialData?.jobs?.length ?? 0,
  );
  const [totalJobsCount, setTotalJobsCount] = useState<number>(
    () => initialData?.totalJobsCount ?? initialData?.jobs?.length ?? 0,
  );
  const [totalPages, setTotalPages] = useState<number>(() => initialData?.totalPages ?? 1);
  const [filterOptions, setFilterOptions] = useState<BulletinFilterOptions>(
    () => initialData?.filterOptions ?? EMPTY_FILTER_OPTIONS,
  );
  const [loading, setLoading] = useState(!hasInitialRenderData);
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        locale,
        request: effectiveRequest,
      }),
    [locale, effectiveRequest],
  );

  const loadJobs = useCallback(async ({
    showLoading,
  }: {
    showLoading: boolean;
  }) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(
        `/api/bulletin?${buildBulletinQueryString({
          locale,
          request: effectiveRequest,
        })}`,
        {
          signal: controller.signal,
          cache: 'no-cache',
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? t('loadFailed'));
      }

      const data = (await response.json()) as BulletinApiPayload;
      if (requestId !== requestIdRef.current) return;

      const formattedTime = formatLastScrapeTime(data.lastScrapeTime, locale);
      setLastScrapeTime(formattedTime);
      setAllJobs(data.jobs ?? []);
      setFilteredJobsCount(data.filteredJobsCount ?? data.jobs?.length ?? 0);
      setTotalJobsCount(data.totalJobsCount ?? data.jobs?.length ?? 0);
      setTotalPages(data.totalPages ?? 1);
      if (data.skillLabels) {
        setSkillLabels(data.skillLabels);
      }
      if (data.filterOptions) {
        setFilterOptions(data.filterOptions);
      }

      if (
        typeof data.currentPage === 'number' &&
        data.currentPage !== effectiveRequest.currentPage
      ) {
        void onResolvedPage?.(data.currentPage);
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
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    }
  }, [locale, effectiveRequest, onResolvedPage, t]);

  const refresh = useCallback(
    async () =>
      loadJobs({
        showLoading: true,
      }),
    [loadJobs],
  );

  const fetchAllFilteredJobs = useCallback(async (): Promise<JobPosting[]> => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    try {
      const response = await fetch(
        `/api/bulletin?${buildBulletinQueryString({
          locale,
          request: effectiveRequest,
          includeAllFilteredJobs: true,
        })}`,
        {
          signal: controller.signal,
          cache: 'no-cache',
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? t('loadFailed'));
      }

      const data = (await response.json()) as BulletinApiPayload;
      return data.jobs ?? [];
    } finally {
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    }
  }, [effectiveRequest, locale, t]);

  const initialFetchDone = useRef(hasInitialRenderData);

  useEffect(() => {
    if (initialFetchDone.current) {
      initialFetchDone.current = false;
      return;
    }

    void loadJobs({ showLoading: true });
  }, [loadJobs, queryKey]);

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort();
    };
  }, []);

  return {
    allJobs,
    setAllJobs,
    lastScrapeTime,
    skillLabels,
    setSkillLabels,
    filteredJobsCount,
    totalJobsCount,
    totalPages,
    filterOptions,
    loading,
    error,
    itemsPerPage: BULLETIN_ITEMS_PER_PAGE,
    refresh,
    fetchAllFilteredJobs,
  };
}
