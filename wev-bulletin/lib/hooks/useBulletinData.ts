'use client';

import { useCallback } from 'react';
import type { JobPosting } from '@/lib/supabase';
import { useBulletinFetch } from './useBulletinFetch';
import { useUserJobMeta } from './useUserJobMeta';
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
  const { filters, sortBy, currentPage, setCurrentPage } = options;

  // 1. Data Fetching Layer (server-driven pagination/filter/search)
  const {
    allJobs,
    setAllJobs,
    lastScrapeTime,
    skillLabels,
    filteredJobsCount,
    totalJobsCount,
    totalPages,
    itemsPerPage,
    filterOptions,
    loading,
    error,
    refresh,
    fetchAllFilteredJobs,
  } = useBulletinFetch(
    locale,
    {
      filters,
      sortBy,
      currentPage,
    },
    initialData,
    setCurrentPage,
  );

  // 2. User Meta Layer (Matches & Bookmarks)
  const { matchData, setBookmarkedJobIds, bookmarkedJobIds } = useUserJobMeta(
    userId,
    allJobs,
    initialData,
  );

  // 3. Optimistic Action Handlers
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
    filteredJobsCount,
    totalJobsCount,
    lastScrapeTime,
    loading,
    error,
    matchData,
    bookmarkedJobIds,
    skillLabels,
    filterOptions,
    totalPages,
    itemsPerPage,
    refresh,
    fetchAllFilteredJobs,
    handleJobSseChange,
    handleJobBookmarkChange,
  };
}
