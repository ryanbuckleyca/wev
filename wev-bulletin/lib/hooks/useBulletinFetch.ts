'use client';

import { useReducer, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { formatLastScrapeTime } from '@/lib/bulletin/client-data';
import { BULLETIN_FETCH_TIMEOUT_MS, BULLETIN_SEARCH_DEBOUNCE_MS } from '@/lib/bulletin/constants';
import type { JobPosting } from '@/lib/supabase';
import type { BulletinFilters, JobSortOption } from '@/lib/bulletin/types';
import type { InitialBulletinData, SkillLabel } from '@/lib/bulletin/types';
import type { BulletinFilterOptions } from '@/lib/bulletin/server-data';

/** State managed by the useBulletinFetch hook. */
interface BulletinState {
  paginatedJobs: JobPosting[];
  totalCount: number;
  lastScrapeTime: string | null;
  skillLabels: Record<string, SkillLabel>;
  filterOptions: BulletinFilterOptions | null;
  loading: boolean;
  error: string | null;
}

type BulletinAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: Partial<BulletinState> }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'SET_PAGINATED_JOBS'; payload: JobPosting[] | ((prev: JobPosting[]) => JobPosting[]) };

function bulletinReducer(state: BulletinState, action: BulletinAction): BulletinState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS':
      return { ...state, ...action.payload, loading: false, error: null };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'SET_PAGINATED_JOBS': {
      const nextJobs =
        typeof action.payload === 'function' ? action.payload(state.paginatedJobs) : action.payload;
      return { ...state, paginatedJobs: nextJobs };
    }
    default:
      return state;
  }
}

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
    const values = arrays[filterKey as keyof typeof arrays];
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

  const [state, dispatch] = useReducer(bulletinReducer, {
    paginatedJobs: [],
    totalCount: 0,
    lastScrapeTime: initialData?.scrapeTime
      ? formatLastScrapeTime(initialData.scrapeTime, locale)
      : null,
    skillLabels: initialData?.skillLabels ?? {},
    filterOptions: initialData?.filterOptions ?? null,
    loading: true,
    error: null,
  });

  const fetchJobs = useCallback(
    async (overrideFilters?: BulletinFilters, overridePage?: number) => {
      const activeFilters = overrideFilters ?? filters;
      const activePage = overridePage ?? currentPage;

      const requestId = ++requestIdRef.current;
      dispatch({ type: 'FETCH_START' });

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

        dispatch({
          type: 'FETCH_SUCCESS',
          payload: {
            paginatedJobs: data.jobs ?? [],
            totalCount: data.totalCount ?? 0,
            lastScrapeTime: data.lastScrapeTime
              ? formatLastScrapeTime(data.lastScrapeTime, locale)
              : state.lastScrapeTime,
            skillLabels: data.skillLabels ?? state.skillLabels,
            filterOptions: data.filterOptions ?? state.filterOptions,
          },
        });
      } catch (fetchError) {
        if (requestId !== requestIdRef.current) return;
        console.error('Error fetching bulletin data:', fetchError);

        let message = t('loadFailed');
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
          message = t('timeout');
        } else if (fetchError instanceof Error) {
          message = fetchError.message;
        }

        dispatch({ type: 'FETCH_ERROR', payload: message });
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [
      locale,
      filters,
      sortBy,
      currentPage,
      t,
      state.lastScrapeTime,
      state.skillLabels,
      state.filterOptions,
    ],
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
    const stateChanged = lastKeyRef.current !== otherStateKey;
    lastKeyRef.current = otherStateKey;

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (stateChanged) {
      void fetchJobs();
    } else {
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

  const setPaginatedJobs = useCallback(
    (payload: JobPosting[] | ((prev: JobPosting[]) => JobPosting[])) => {
      dispatch({ type: 'SET_PAGINATED_JOBS', payload });
    },
    [],
  );

  const refresh = fetchJobs;

  return {
    ...state,
    setPaginatedJobs,
    refresh,
  };
}
