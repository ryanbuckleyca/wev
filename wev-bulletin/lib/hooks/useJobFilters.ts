'use client';

import { useMemo, useEffect, useRef } from 'react';
import { BULLETIN_ITEMS_PER_PAGE, filterJobs, sortJobs } from '@/lib/bulletin/job-query';
import type { JobPosting, JobMatchData } from '@/lib/supabase';
import type { UseBulletinDataOptions } from '@/lib/bulletin/types';

interface UseJobFiltersMeta {
  partialData?: boolean;
  initialTotalPages?: number;
}

export function useJobFilters(
  allJobs: JobPosting[],
  matchData: Map<string, JobMatchData>,
  { filters, sortBy, currentPage, setCurrentPage }: UseBulletinDataOptions,
  { partialData = false, initialTotalPages = 0 }: UseJobFiltersMeta = {},
) {
  // Reset page to 1 when filters change
  const filterSnapshot = useMemo(() => JSON.stringify({ filters, sortBy }), [filters, sortBy]);
  const previousFilterSnapshot = useRef(filterSnapshot);

  useEffect(() => {
    if (partialData) return;
    if (previousFilterSnapshot.current === filterSnapshot) return;
    previousFilterSnapshot.current = filterSnapshot;
    if (currentPage !== 1) {
      void setCurrentPage(1);
    }
  }, [partialData, filterSnapshot, currentPage, setCurrentPage]);

  // Derived filtered results
  const filteredJobs = useMemo(
    () => (partialData ? allJobs : sortJobs(filterJobs(allJobs, filters), sortBy, matchData)),
    [partialData, allJobs, filters, sortBy, matchData],
  );

  const totalPages = partialData
    ? initialTotalPages
    : Math.ceil(filteredJobs.length / BULLETIN_ITEMS_PER_PAGE);

  // Sync current page with total pages
  useEffect(() => {
    if (partialData) return;
    if (totalPages === 0) {
      if (currentPage !== 1) void setCurrentPage(1);
      return;
    }
    if (currentPage > totalPages) {
      void setCurrentPage(totalPages);
    }
  }, [partialData, currentPage, totalPages, setCurrentPage]);

  const paginatedJobs = useMemo(() => {
    if (partialData) return allJobs;
    const startIndex = (currentPage - 1) * BULLETIN_ITEMS_PER_PAGE;
    return filteredJobs.slice(startIndex, startIndex + BULLETIN_ITEMS_PER_PAGE);
  }, [partialData, allJobs, currentPage, filteredJobs]);

  return {
    filteredJobs,
    paginatedJobs,
    totalPages,
    itemsPerPage: BULLETIN_ITEMS_PER_PAGE,
  };
}
