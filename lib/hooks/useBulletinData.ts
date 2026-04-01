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

const ITEMS_PER_PAGE = 20;
const FETCH_TIMEOUT_MS = 10_000;

type PageSetter = (page: number) => Promise<unknown> | void;

interface UseBulletinDataOptions {
  filters: BulletinFilters;
  sortBy: JobSortOption;
  currentPage: number;
  setCurrentPage: PageSetter;
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

export function useBulletinData(
  locale: string,
  userId: string | null,
  { filters, sortBy, currentPage, setCurrentPage }: UseBulletinDataOptions,
): BulletinDataState {
  const t = useTranslations('home.errors');
  const requestIdRef = useRef(0);
  const [allJobs, setAllJobs] = useState<JobPosting[]>([]);
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullDataLoaded, setFullDataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<Map<string, JobMatchData>>(new Map());
  const [bookmarkedJobIds, setBookmarkedJobIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setFullDataLoaded(false);
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      // Fetch first page immediately for fast initial paint
      const firstPageResponse = await fetch(
        `/api/bulletin?locale=${locale}&limit=20`,
        { signal: controller.signal },
      );

      if (!firstPageResponse.ok) {
        const body = await firstPageResponse.json().catch(() => ({}));
        throw new Error(body.error ?? t('loadFailed'));
      }

      const firstPageData = await firstPageResponse.json();
      if (requestId !== requestIdRef.current) return;

      setLastScrapeTime(formatLastScrapeTime(firstPageData.lastScrapeTime, locale));
      setAllJobs(firstPageData.jobs ?? []);
      setLoading(false);
      void setCurrentPage(1);

      // If there are more jobs, fetch the full set in the background.
      // No abort controller here — we want this to complete even if slow.
      if (firstPageData.total > firstPageData.jobs.length) {
        try {
          const fullResponse = await fetch(`/api/bulletin?locale=${locale}`);
          if (!fullResponse.ok) {
            console.warn('[bulletin] Background full fetch failed:', fullResponse.status);
            return;
          }
          const fullData = await fullResponse.json();
          if (requestId !== requestIdRef.current) return;
          setAllJobs(fullData.jobs ?? []);
          setLastScrapeTime(formatLastScrapeTime(fullData.lastScrapeTime, locale));
          setFullDataLoaded(true);
        } catch (bgError) {
          console.warn('[bulletin] Background full fetch error:', bgError);
        }
      } else {
        setFullDataLoaded(true);
      }
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching bulletin data:', fetchError);
      setError(getErrorMessage(fetchError, t('loadFailed'), t('timeout')));
      setLoading(false);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [locale, setCurrentPage, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  useEffect(() => {
    if (!userId || allJobs.length === 0 || !fullDataLoadedRef.current) {
      if (!userId || allJobs.length === 0) {
        setMatchData(new Map());
        setBookmarkedJobIds(new Set());
      }
      return;
    }

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
    totalPages,
    itemsPerPage: ITEMS_PER_PAGE,
    refresh,
    handleJobSseChange,
    handleJobBookmarkChange,
  };
}
