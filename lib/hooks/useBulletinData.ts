'use client';

import { useCallback } from 'react';
import type { JobPosting } from '@/lib/supabase';
import { useBulletinFetch } from './useBulletinFetch';
import { useUserJobMeta } from './useUserJobMeta';
import { useJobFilters } from './useJobFilters';
import type { 
  InitialBulletinData, 
  BulletinDataState, 
  UseBulletinDataOptions 
} from '@/lib/bulletin/types';

export function useBulletinData(
  locale: string,
  userId: string | null,
  options: UseBulletinDataOptions,
  initialData?: InitialBulletinData,
): BulletinDataState {
  const { setCurrentPage } = options;

  // 1. Data Fetching Layer
  const fetch = useBulletinFetch(locale, initialData, () => {
    void setCurrentPage(1);
  });

  // 2. User Meta Layer (Matches & Bookmarks)
  const meta = useUserJobMeta(userId, fetch.allJobs, initialData);

  // 3. Transformation Layer (Filter, Sort, Paginate)
  const filters = useJobFilters(fetch.allJobs, meta.matchData, options);

  // 4. Optimistic Action Handlers
  const handleJobSseChange = useCallback((jobId: string, isSse: boolean) => {
    fetch.setAllJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, is_sse: isSse } : job))
    );
  }, [fetch.setAllJobs]);

  const handleJobBookmarkChange = useCallback((job: JobPosting, bookmarked: boolean) => {
    meta.setBookmarkedJobIds((prev) => {
      const next = new Set(prev);
      if (bookmarked) next.add(job.id);
      else next.delete(job.id);
      return next;
    });
  }, [meta.setBookmarkedJobIds]);

  return {
    allJobs: fetch.allJobs,
    filteredJobs: filters.filteredJobs,
    paginatedJobs: filters.paginatedJobs,
    lastScrapeTime: fetch.lastScrapeTime,
    loading: fetch.loading,
    error: fetch.error,
    matchData: meta.matchData,
    bookmarkedJobIds: meta.bookmarkedJobIds,
    skillLabels: fetch.skillLabels,
    totalPages: filters.totalPages,
    itemsPerPage: filters.itemsPerPage,
    refresh: fetch.refresh,
    handleJobSseChange,
    handleJobBookmarkChange,
  };
}
