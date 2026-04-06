'use client';

import { useMemo, useEffect, useRef } from 'react';
import { filterJobs, sortJobs } from '@/lib/bulletin/job-query';
import type { JobPosting, JobMatchData } from '@/lib/supabase';
import type { UseBulletinDataOptions } from '@/lib/bulletin/types';

const ITEMS_PER_PAGE = 20;

export function useJobFilters(
  allJobs: JobPosting[],
  matchData: Map<string, JobMatchData>,
  { filters, sortBy, currentPage, setCurrentPage }: UseBulletinDataOptions
) {
  // Reset page to 1 when filters change
  const filterSnapshot = useMemo(() => JSON.stringify({ filters, sortBy }), [filters, sortBy]);
  const previousFilterSnapshot = useRef(filterSnapshot);

  useEffect(() => {
    if (previousFilterSnapshot.current === filterSnapshot) return;
    previousFilterSnapshot.current = filterSnapshot;
    if (currentPage !== 1) {
      void setCurrentPage(1);
    }
  }, [filterSnapshot, currentPage, setCurrentPage]);

  // Derived filtered results
  const filteredJobs = useMemo(
    () => sortJobs(filterJobs(allJobs, filters), sortBy, matchData),
    [allJobs, filters, sortBy, matchData]
  );

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE);

  // Sync current page with total pages
  useEffect(() => {
    if (totalPages === 0) {
      if (currentPage !== 1) void setCurrentPage(1);
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

  return {
    filteredJobs,
    paginatedJobs,
    totalPages,
    itemsPerPage: ITEMS_PER_PAGE,
  };
}
