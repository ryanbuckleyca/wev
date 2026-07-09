'use client';

import SearchBar from './SearchBar';
import type { ActiveFilterChip } from './JobSearch';

interface OrganizationSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filtersExpanded: boolean;
  onFiltersExpandedChange: (expanded: boolean) => void;
  activeFilterChips: ActiveFilterChip[];
  filteredCount: number;
  totalCount: number;
  loading?: boolean;
  hasAnyFilters: boolean;
  isSuggestedDefaults: boolean;
  onClearAllFilters: () => void;
  onApplySuggestedDefaults: () => void;
}

export default function OrganizationSearch({
  searchQuery,
  onSearchChange,
  filtersExpanded,
  onFiltersExpandedChange,
  activeFilterChips,
  filteredCount,
  totalCount,
  loading = false,
  hasAnyFilters,
  isSuggestedDefaults,
  onClearAllFilters,
  onApplySuggestedDefaults,
}: OrganizationSearchProps) {
  return (
    <SearchBar
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      labelKey="organizations.searchLabel"
      placeholderKey="organizations.searchPlaceholder"
      inputId="org-search"
      filtersExpanded={filtersExpanded}
      onFiltersExpandedChange={onFiltersExpandedChange}
      filterControlsId="org-filters-content"
      activeFilterChips={activeFilterChips}
      countConfig={{
        filtered: filteredCount,
        total: totalCount,
        ofKey: 'organizations.of',
        singularKey: 'organizations.organization',
        pluralKey: 'organizations.organizations',
      }}
      loading={loading}
      hasAnyFilters={hasAnyFilters}
      isSuggestedDefaults={isSuggestedDefaults}
      onClearAllFilters={onClearAllFilters}
      onApplySuggestedDefaults={onApplySuggestedDefaults}
    />
  );
}
