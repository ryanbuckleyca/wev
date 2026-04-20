'use client';

import { useEffect, useRef } from 'react';
import type { UseBulletinDataOptions } from '@/lib/bulletin/types';

// The server fetches 20 items at a time
const ITEMS_PER_PAGE = 20;

export function useJobFilters(
  totalJobs: number,
  { filters, sortBy, currentPage, setCurrentPage }: UseBulletinDataOptions,
) {
  // Reset page to 1 when filters or sort change
  const filterSnapshot = JSON.stringify({ filters, sortBy });
  const previousFilterSnapshot = useRef(filterSnapshot);

  useEffect(() => {
    if (previousFilterSnapshot.current === filterSnapshot) return;
    previousFilterSnapshot.current = filterSnapshot;
    if (currentPage !== 1) {
      void setCurrentPage(1);
    }
  }, [filterSnapshot, currentPage, setCurrentPage]);

  const totalPages = Math.max(1, Math.ceil(totalJobs / ITEMS_PER_PAGE));

  // Sync current page with total pages (e.g., if total pages shrinks)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      void setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, setCurrentPage]);

  return {
    totalPages,
    itemsPerPage: ITEMS_PER_PAGE,
  };
}
