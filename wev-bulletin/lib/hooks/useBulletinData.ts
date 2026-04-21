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
    jobsOnPage,
    setJobsOnPage,
    totalMatchingJobs,
    lastScrapeTime,
    skillLabels,
    loading,
    error,
    refresh,
  } = useBulletinFetch(locale, options, initialData);

  // 2. User Meta Layer (Matches & Bookmarks)
  // useUserJobMeta needs the current visible jobs or all known jobs it can bind matches to
  const { matchData, setBookmarkedJobIds, bookmarkedJobIds, isLoading: userMetaLoading } =
    useUserJobMeta(
    userId,
    jobsOnPage,
    initialData,
  );

  // 3. Transformation Layer (Filter, Paginate)
  const filters = useJobFilters(totalMatchingJobs, options);

  // 4. Optimistic Action Handlers
  const handleJobSseChange = useCallback(
    (jobId: string, isSse: boolean) => {
      setJobsOnPage((prev) =>
        prev.map((job) => (job.id === jobId ? { ...job, is_sse: isSse } : job)),
      );
    },
    [setJobsOnPage],
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
    jobsOnPage,
    totalMatchingJobs,
    lastScrapeTime,
    loading,
    userMetaLoading,
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
