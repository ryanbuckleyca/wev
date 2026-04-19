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

const ITEMS_PER_PAGE = 20;

export function useBulletinData(
  locale: string,
  userId: string | null,
  options: UseBulletinDataOptions,
  initialData?: InitialBulletinData,
): BulletinDataState {
  const { filters, sortBy, currentPage } = options;

  // 1. Data Fetching Layer — now includes filters/sort/page
  const {
    paginatedJobs,
    setPaginatedJobs,
    totalCount,
    lastScrapeTime,
    skillLabels,
    filterOptions,
    loading,
    error,
    refresh,
  } = useBulletinFetch(locale, filters, sortBy, currentPage, initialData);

  // 2. User Meta Layer (Matches & Bookmarks)
  const { matchData, setBookmarkedJobIds, bookmarkedJobIds } = useUserJobMeta(
    userId,
    paginatedJobs,
    initialData,
  );

  // 3. Pagination is done server-side — totalPages derived from totalCount
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

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
    paginatedJobs,
    totalCount,
    lastScrapeTime,
    loading,
    error,
    matchData,
    bookmarkedJobIds,
    skillLabels,
    filterOptions,
    totalPages,
    itemsPerPage: ITEMS_PER_PAGE,
    refresh,
    handleJobSseChange,
    handleJobBookmarkChange,
  };
}
