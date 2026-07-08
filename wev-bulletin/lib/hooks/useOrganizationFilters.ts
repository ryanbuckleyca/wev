'use client';

import { useMemo, useCallback } from 'react';
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';

export interface OrganizationFilters {
  searchQuery: string;
  /** When true, non-SSE orgs are included. Default is false (SSE-only view). */
  showNonSse: boolean;
  selectedProvinces: string[];
  selectedMunicipalities: string[];
  selectedTypes: string[];
}

/**
 * Complete controls object returned by useOrganizationFilters.
 *
 * Convention:
 * - `filters` — the compiled snapshot used by data hooks (pass this to useOrganizationData).
 * - Individual fields (searchQuery, showNonSse, …) — raw values + setters for UI controls.
 *   They mirror `filters.*` exactly; use whichever reads more clearly at the call site.
 */
export interface OrganizationFilterControls {
  filters: OrganizationFilters;
  searchQuery: string;
  setSearchQuery: (value: string | null) => Promise<unknown> | void;
  showNonSse: boolean;
  setShowNonSse: (value: boolean | null) => Promise<unknown> | void;
  selectedProvinces: string[];
  setSelectedProvinces: (value: string[] | null) => Promise<unknown> | void;
  selectedMunicipalities: string[];
  setSelectedMunicipalities: (value: string[] | null) => Promise<unknown> | void;
  selectedTypes: string[];
  setSelectedTypes: (value: string[] | null) => Promise<unknown> | void;
  currentPage: number;
  setCurrentPage: (value: number | null) => Promise<unknown> | void;
  sortBy: string;
  setSortBy: (value: string | null) => Promise<unknown> | void;
  hasAnyFilters: boolean;
  isSuggestedDefaults: boolean;
  clearAllFilters: () => void;
  applySuggestedDefaults: () => void;
}

export function useOrganizationFilters(): OrganizationFilterControls {
  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));
  // showNonSse defaults to false → SSE-only view by default, without an active filter
  const [showNonSse, setShowNonSse] = useQueryState('nonSse', parseAsBoolean.withDefault(false));
  const [selectedProvinces, setSelectedProvinces] = useQueryState(
    'province',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedMunicipalities, setSelectedMunicipalities] = useQueryState(
    'municipality',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedTypes, setSelectedTypes] = useQueryState(
    'type',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [currentPage, setCurrentPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [sortBy, setSortBy] = useQueryState('sortBy', parseAsString.withDefault('value-match-desc'));

  const filters = useMemo<OrganizationFilters>(
    () => ({
      searchQuery,
      showNonSse,
      selectedProvinces,
      selectedMunicipalities,
      selectedTypes,
    }),
    [searchQuery, showNonSse, selectedProvinces, selectedMunicipalities, selectedTypes],
  );

  // hasAnyFilters is false at the default state (showNonSse=false, nothing else set)
  const hasAnyFilters = useMemo(
    () =>
      !!searchQuery ||
      showNonSse ||
      selectedProvinces.length > 0 ||
      selectedMunicipalities.length > 0 ||
      selectedTypes.length > 0,
    [searchQuery, showNonSse, selectedProvinces, selectedMunicipalities, selectedTypes],
  );

  // Suggested defaults: showNonSse off (SSE-only), nothing else active
  const isSuggestedDefaults = useMemo(
    () =>
      !searchQuery &&
      !showNonSse &&
      selectedProvinces.length === 0 &&
      selectedMunicipalities.length === 0 &&
      selectedTypes.length === 0,
    [searchQuery, showNonSse, selectedProvinces, selectedMunicipalities, selectedTypes],
  );

  const resetFilters = useCallback(
    (nonSseDefault: boolean) => {
      void setSearchQuery('');
      void setShowNonSse(nonSseDefault);
      void setSelectedProvinces([]);
      void setSelectedMunicipalities([]);
      void setSelectedTypes([]);
      void setCurrentPage(1);
    },
    [setSearchQuery, setShowNonSse, setSelectedProvinces, setSelectedMunicipalities, setSelectedTypes, setCurrentPage],
  );

  // clearAllFilters: resets everything, SSE filter goes back to SSE-only (default view).
  // applySuggestedDefaults: same as clear — SSE-only is the suggested default for orgs.
  const clearAllFilters = useCallback(() => resetFilters(false), [resetFilters]);
  const applySuggestedDefaults = clearAllFilters;

  return {
    filters,
    searchQuery,
    setSearchQuery,
    showNonSse,
    setShowNonSse,
    selectedProvinces,
    setSelectedProvinces,
    selectedMunicipalities,
    setSelectedMunicipalities,
    selectedTypes,
    setSelectedTypes,
    currentPage,
    setCurrentPage,
    sortBy,
    setSortBy,
    hasAnyFilters,
    isSuggestedDefaults,
    clearAllFilters,
    applySuggestedDefaults,
  };
}
