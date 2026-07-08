'use client';

import SearchBar from './SearchBar';

export interface ActiveFilterChip {
  id: string;
  label: string;
  onRemove?: () => void;
  title?: string;
}

interface JobSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filtersExpanded: boolean;
  onFiltersExpandedChange: (expanded: boolean) => void;
  activeFilterChips: ActiveFilterChip[];
  filteredJobsCount: number;
  totalJobsCount: number;
  loading?: boolean;
  hasAnyFilters: boolean;
  isSuggestedDefaults: boolean;
  onClearAllFilters: () => void;
  onApplySuggestedDefaults: () => void;
}

export default function JobSearch({
  searchQuery,
  onSearchChange,
  filtersExpanded,
  onFiltersExpandedChange,
  activeFilterChips,
  filteredJobsCount,
  totalJobsCount,
  loading = false,
  hasAnyFilters,
  isSuggestedDefaults,
  onClearAllFilters,
  onApplySuggestedDefaults,
}: JobSearchProps) {
  return (
    <SearchBar
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      labelKey="search.label"
      placeholderKey="search.placeholder"
      inputId="search"
      filtersExpanded={filtersExpanded}
      onFiltersExpandedChange={onFiltersExpandedChange}
      filterControlsId="job-filters-content"
      activeFilterChips={activeFilterChips}
      countConfig={{
        filtered: filteredJobsCount,
        total: totalJobsCount,
        ofKey: 'pagination.of',
        singularKey: 'pagination.job',
        pluralKey: 'pagination.jobs',
      }}
      loading={loading}
      hasAnyFilters={hasAnyFilters}
      isSuggestedDefaults={isSuggestedDefaults}
      onClearAllFilters={onClearAllFilters}
      onApplySuggestedDefaults={onApplySuggestedDefaults}
      filterToggleWithTestId
    />
  );
}

