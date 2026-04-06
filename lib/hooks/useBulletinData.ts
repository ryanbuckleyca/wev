'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  filterJobs,
  sortJobs,
  type BulletinFilters,
  type JobSortOption,
} from '@/lib/bulletin/job-query';
import { fetchMatchMapForJobs } from '@/lib/bulletin/match-map';
import { fetchBookmarkedJobIds, formatLastScrapeTime } from '@/lib/bulletin/client-data';
import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { SerializedMatchData } from '@/lib/bulletin/server-data';

const ITEMS_PER_PAGE = 20;
const FETCH_TIMEOUT_MS = 10_000;

type PageSetter = (page: number) => Promise<unknown> | void;

interface UseBulletinDataOptions {
  filters: BulletinFilters;
  sortBy: JobSortOption;
  currentPage: number;
  setCurrentPage: PageSetter;
}

/**
 * Server-side data passed from the Server Component via BulletinPageClient.
 * When provided, the hook initializes with this data and skips the first fetch.
 */
interface InitialData {
  jobs: JobPosting[];
  scrapeTime: string | null;
  matchData?: SerializedMatchData;
  bookmarkedJobIds?: string[];
  skillLabels?: Record<string, import('@/lib/resolve-skill-labels').SkillLabel>;
}

export interface BulletinDataState {
  allJobs: JobPosting[];
  filteredJobs: JobPosting[];
  paginatedJobs: JobPosting[];
  lastScrapeTime: string | null;
  loading: boolean;
  error: string | null;
  matchData: Map<string, JobMatchData>;
  bookmarkedJobIds: Set<string>;
  skillLabels: Record<string, import('@/lib/resolve-skill-labels').SkillLabel>;
  totalPages: number;
  itemsPerPage: number;
  refresh: () => Promise<void>;
  handleJobSseChange: (jobId: string, isSse: boolean) => void;
  handleJobBookmarkChange: (job: JobPosting, bookmarked: boolean) => void;
}

function getErrorMessage(error: unknown, loadFailedMessage: string, timeoutMessage: string) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return timeoutMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  return loadFailedMessage;
}

/**
 * Converts the serialized match data (Record from server) into a Map for
 * client-side usage. Returns an empty Map when no data is provided.
 */
function hydrateMatchData(serialized?: SerializedMatchData): Map<string, JobMatchData> {
  if (!serialized) return new Map();
  return new Map(Object.entries(serialized));
}

export function useBulletinData(
  locale: string,
  userId: string | null,
  { filters, sortBy, currentPage, setCurrentPage }: UseBulletinDataOptions,
  initialData?: InitialData,
): BulletinDataState {
  const t = useTranslations('home.errors');
  const requestIdRef = useRef(0);

  // If initialData is provided, the page was server-rendered with data —
  // skip the loading state entirely.
  const hasInitialData = !!initialData;

  const [allJobs, setAllJobs] = useState<JobPosting[]>(
    () => initialData?.jobs ?? [],
  );
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(
    () => (initialData?.scrapeTime
      ? formatLastScrapeTime(initialData.scrapeTime, locale)
      : null),
  );
  const [loading, setLoading] = useState(!hasInitialData);
  const [error, setError] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<Map<string, JobMatchData>>(
    () => hydrateMatchData(initialData?.matchData),
  );
  const [bookmarkedJobIds, setBookmarkedJobIds] = useState<Set<string>>(
    () => new Set(initialData?.bookmarkedJobIds ?? []),
  );
  const [skillLabels, setSkillLabels] = useState<Record<string, import('@/lib/resolve-skill-labels').SkillLabel>>(
    () => initialData?.skillLabels ?? {}
  );

  // ─── Refresh: single fetch from the API endpoint ────────────────────────
  // Used for manual re-scrape (admin) and for re-hydrating after login/logout.
  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(
        `/api/bulletin?locale=${locale}`,
        { signal: controller.signal, cache: 'no-cache' },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? t('loadFailed'));
      }

      const data = await response.json();
      if (requestId !== requestIdRef.current) return;

      setLastScrapeTime(formatLastScrapeTime(data.lastScrapeTime, locale));
      setAllJobs(data.jobs ?? []);
      if (data.skillLabels) {
        setSkillLabels(data.skillLabels);
      }
      setLoading(false);
      void setCurrentPage(1);
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching bulletin data:', fetchError);
      setError(getErrorMessage(fetchError, t('loadFailed'), t('timeout')));
      setLoading(false);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [locale, setCurrentPage, t]);

  // ─── Initial fetch (only when no SSR data) ──────────────────────────────
  const initialFetchDone = useRef(hasInitialData);
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    void refresh();
  }, [refresh]);

  // ─── Reset page to 1 when filters change ────────────────────────────────
  const filterSnapshot = useMemo(
    () =>
      JSON.stringify({
        searchQuery: filters.searchQuery,
        selectedOrganizations: filters.selectedOrganizations,
        selectedProvinces: filters.selectedProvinces,
        selectedMunicipalities: filters.selectedMunicipalities,
        selectedEmploymentTypes: filters.selectedEmploymentTypes,
        selectedSources: filters.selectedSources,
        selectedWorkTypes: filters.selectedWorkTypes,
        showOnlySse: filters.showOnlySse,
        showJobsWithoutSalary: filters.showJobsWithoutSalary,
        postedWithin: filters.postedWithin,
        sortBy,
      }),
    [
      filters.searchQuery,
      filters.selectedOrganizations,
      filters.selectedProvinces,
      filters.selectedMunicipalities,
      filters.selectedEmploymentTypes,
      filters.selectedSources,
      filters.selectedWorkTypes,
      filters.showOnlySse,
      filters.showJobsWithoutSalary,
      filters.postedWithin,
      sortBy,
    ],
  );

  const previousFilterSnapshot = useRef(filterSnapshot);

  useEffect(() => {
    if (previousFilterSnapshot.current === filterSnapshot) return;

    previousFilterSnapshot.current = filterSnapshot;

    if (currentPage !== 1) {
      void setCurrentPage(1);
    }
  }, [filterSnapshot, currentPage, setCurrentPage]);

  // ─── User data (matches + bookmarks) ────────────────────────────────────
  // Re-fetches only when the userId changes (login/logout). When the page is
  // server-rendered with match data, the initial state already holds it so
  // no client-side fetch is needed until the user changes.
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Clear data when logged out or no jobs.
    if (!userId || allJobs.length === 0) {
      setMatchData(new Map());
      setBookmarkedJobIds(new Set());
      prevUserIdRef.current = userId;
      return;
    }

    // Skip if we already have data for this user (from SSR or a previous fetch).
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;

    let cancelled = false;
    const jobIds = allJobs.map((job) => job.id);

    void Promise.all([
      fetchMatchMapForJobs(userId, jobIds),
      fetchBookmarkedJobIds(userId, jobIds),
    ]).then(([matches, bookmarked]) => {
      if (cancelled) return;
      setMatchData(matches);
      setBookmarkedJobIds(bookmarked);
    });

    return () => {
      cancelled = true;
    };
  }, [allJobs, userId]);

  // ─── Filtering, sorting, pagination ─────────────────────────────────────
  const filteredJobs = useMemo(
    () => sortJobs(filterJobs(allJobs, filters), sortBy, matchData),
    [allJobs, filters, sortBy, matchData],
  );

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE);

  useEffect(() => {
    if (totalPages === 0) {
      if (currentPage !== 1) {
        void setCurrentPage(1);
      }
      return;
    }

    if (currentPage > totalPages) {
      void setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, setCurrentPage]);

  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredJobs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [currentPage, filteredJobs]);

  // ─── Optimistic updates ─────────────────────────────────────────────────
  const handleJobSseChange = useCallback((jobId: string, isSse: boolean) => {
    setAllJobs((previousJobs) =>
      previousJobs.map((job) => (job.id === jobId ? { ...job, is_sse: isSse } : job)),
    );
  }, []);

  const handleJobBookmarkChange = useCallback((job: JobPosting, bookmarked: boolean) => {
    setBookmarkedJobIds((previousJobIds) => {
      const nextJobIds = new Set(previousJobIds);
      if (bookmarked) {
        nextJobIds.add(job.id);
      } else {
        nextJobIds.delete(job.id);
      }
      return nextJobIds;
    });
  }, []);

  return {
    allJobs,
    filteredJobs,
    paginatedJobs,
    lastScrapeTime,
    loading,
    error,
    matchData,
    bookmarkedJobIds,
    skillLabels,
    totalPages,
    itemsPerPage: ITEMS_PER_PAGE,
    refresh,
    handleJobSseChange,
    handleJobBookmarkChange,
  };
}
