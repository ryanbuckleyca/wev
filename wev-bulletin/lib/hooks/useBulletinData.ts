'use client';

import { useCallback } from 'react';
import type { JobPosting } from '@/lib/supabase';
import { useBulletinFetch } from './useBulletinFetch';
import { useUserJobMeta } from './useUserJobMeta';
import { useJobFilters } from './useJobFilters';
import type {
  InitialBulletinData,
  BulletinDataState,
  UseBulletinDataOptions,
} from '@/lib/bulletin/types';

export function useBulletinData(
  locale: string,
  userId: string | null,
  options: UseBulletinDataOptions,
  initialData?: InitialBulletinData,
): BulletinDataState {
  const { setCurrentPage } = options;

  // 1. Data Fetching Layer
  const {
    allJobs,
    setAllJobs,
    lastScrapeTime,
    skillLabels,
    loading,
    error,
    hasHydratedFullDataset,
    refresh,
  } = useBulletinFetch(locale, initialData, () => {
    void setCurrentPage(1);
  });

  // 2. User Meta Layer (Matches & Bookmarks)
  const { matchData, setBookmarkedJobIds, bookmarkedJobIds } = useUserJobMeta(
    userId,
    allJobs,
    initialData,
  );

  const usingPartialInitialData =
    initialData?.isPartialHydration === true && !hasHydratedFullDataset;

  // 3. Transformation Layer (Filter, Sort, Paginate)
  const filters = useJobFilters(allJobs, matchData, options, {
    partialData: usingPartialInitialData,
    initialTotalPages: initialData?.totalPages,
  });

  const filteredJobsCount = usingPartialInitialData
    ? initialData?.filteredJobsCount ?? filters.filteredJobs.length
    : filters.filteredJobs.length;
  const totalJobsCount = usingPartialInitialData
    ? initialData?.totalJobsCount ?? allJobs.length
    : allJobs.length;
  const totalPages = usingPartialInitialData
    ? initialData?.totalPages ?? filters.totalPages
    : filters.totalPages;

  // 4. Optimistic Action Handlers
  const handleJobSseChange = useCallback(
    (jobId: string, isSse: boolean) => {
      setAllJobs((prev) => prev.map((job) => (job.id === jobId ? { ...job, is_sse: isSse } : job)));
    },
    [setAllJobs],
  );

  const handleJobBookmarkChange = useCallback(
    (job: JobPosting, bookmarked: boolean) => {
      setBookmarkedJobIds((prev) => {
        const next = new Set(prev);
        if (bookmarked) next.add(job.id);
        else next.delete(job.id);
        return next;
      });
    },
    [setBookmarkedJobIds],
  );

  return {
    allJobs,
    filteredJobs: filters.filteredJobs,
    paginatedJobs: filters.paginatedJobs,
    filteredJobsCount,
    totalJobsCount,
    lastScrapeTime,
    loading,
    error,
    matchData,
    bookmarkedJobIds,
    skillLabels,
    totalPages,
    itemsPerPage: filters.itemsPerPage,
    refresh,
    handleJobSseChange,
    handleJobBookmarkChange,
  };
}
