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
  // 1. Data Fetching Layer (DB Paginated)
  const {
    paginatedJobs,
    setPaginatedJobs,
    totalJobs,
    lastScrapeTime,
    skillLabels,
    loading,
    error,
    refresh,
  } = useBulletinFetch(locale, options, initialData);

  // 2. User Meta Layer (Matches & Bookmarks)
  // useUserJobMeta needs the current visible jobs or all known jobs it can bind matches to
  const { matchData, setBookmarkedJobIds, bookmarkedJobIds } = useUserJobMeta(
    userId,
    paginatedJobs, // now binds to the currently viewed slice
    initialData,
  );

  // 3. Transformation Layer (Filter, Paginate)
  const filters = useJobFilters(totalJobs, options);

  // 4. Optimistic Action Handlers
  const handleJobSseChange = useCallback(
    (jobId: string, isSse: boolean) => {
      setPaginatedJobs((prev) =>
        prev.map((job) => (job.id === jobId ? { ...job, is_sse: isSse } : job)),
      );
    },
    [setPaginatedJobs],
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
    allJobs: paginatedJobs, // Deprecated conceptually but satisfies TS interfaces expecting `allJobs`.
    filteredJobs: paginatedJobs,
    paginatedJobs,
    lastScrapeTime,
    loading,
    error,
    matchData,
    bookmarkedJobIds,
    skillLabels,
    totalPages: filters.totalPages,
    itemsPerPage: filters.itemsPerPage,
    refresh,
    handleJobSseChange,
    handleJobBookmarkChange,
  };
}
