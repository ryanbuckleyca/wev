'use client';

import { useEffect, useRef } from 'react';
import type { OrganizationFilters } from './useOrganizationFilters';
import { ORG_JOBS_PER_PAGE } from '@/lib/organizations/constants';

/**
 * Keep org-index pagination in sync with filters: reset to page 1 when the
 * result set changes, and clamp when the current page is past the last page
 * (e.g. searching while still on ?page=15).
 *
 * Mirrors useJobFilters for the jobs board.
 */
export function useOrganizationPagination(
  totalOrgs: number,
  {
    filters,
    sortBy,
    currentPage,
    setCurrentPage,
  }: {
    filters: OrganizationFilters;
    sortBy: string;
    currentPage: number;
    setCurrentPage: (value: number | null) => Promise<unknown> | void;
  },
) {
  const filterSnapshot = JSON.stringify({ filters, sortBy });
  const previousFilterSnapshot = useRef(filterSnapshot);
  // A filter change schedules page 1; suppress the clamp effect until that
  // reset lands so it can't replace page 1 with the (larger) last page.
  const pendingFilterReset = useRef(false);

  useEffect(() => {
    if (previousFilterSnapshot.current === filterSnapshot) return;
    previousFilterSnapshot.current = filterSnapshot;
    if (currentPage !== 1) {
      pendingFilterReset.current = true;
      void setCurrentPage(1);
    }
  }, [filterSnapshot, currentPage, setCurrentPage]);

  const totalPages = Math.max(1, Math.ceil(totalOrgs / ORG_JOBS_PER_PAGE));

  useEffect(() => {
    // Filter reset takes precedence: don't clamp this render, just wait for
    // page 1 to arrive, then resume ordinary clamping.
    if (pendingFilterReset.current) {
      if (currentPage === 1) pendingFilterReset.current = false;
      return;
    }
    if (currentPage > totalPages && totalPages > 0) {
      void setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, setCurrentPage]);

  return {
    totalPages,
    itemsPerPage: ORG_JOBS_PER_PAGE,
  };
}
