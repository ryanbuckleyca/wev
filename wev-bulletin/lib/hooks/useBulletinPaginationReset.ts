import { useRef, useEffect } from 'react';
import type { BulletinFilters, JobSortOption } from '@/lib/bulletin/job-query';

function areFiltersEqual(prev: BulletinFilters, next: BulletinFilters) {
  if (prev.searchQuery !== next.searchQuery) return false;
  if (prev.showOnlySse !== next.showOnlySse) return false;
  if (prev.showJobsWithoutSalary !== next.showJobsWithoutSalary) return false;
  if (prev.postedWithin !== next.postedWithin) return false;
  
  if (prev.selectedOrganizations.join(',') !== next.selectedOrganizations.join(',')) return false;
  if (prev.selectedProvinces.join(',') !== next.selectedProvinces.join(',')) return false;
  if (prev.selectedMunicipalities.join(',') !== next.selectedMunicipalities.join(',')) return false;
  if (prev.selectedEmploymentTypes.join(',') !== next.selectedEmploymentTypes.join(',')) return false;
  if (prev.selectedSources.join(',') !== next.selectedSources.join(',')) return false;
  if (prev.selectedWorkTypes.join(',') !== next.selectedWorkTypes.join(',')) return false;

  return true;
}

export function useBulletinPaginationReset(
  filters: BulletinFilters,
  sortBy: JobSortOption,
  currentPage: number,
  setCurrentPage: (page: number) => Promise<unknown> | void
) {
  const previousFilters = useRef(filters);
  const previousSortBy = useRef(sortBy);

  useEffect(() => {
    const filtersChanged = !areFiltersEqual(previousFilters.current, filters);
    const sortChanged = previousSortBy.current !== sortBy;

    if (filtersChanged || sortChanged) {
      previousFilters.current = filters;
      previousSortBy.current = sortBy;

      if (currentPage !== 1) {
        void setCurrentPage(1);
      }
    }
  }, [filters, sortBy, currentPage, setCurrentPage]);
}
