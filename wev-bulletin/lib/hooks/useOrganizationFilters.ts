'use client';

import { useMemo, useCallback } from 'react';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from 'nuqs';
import { parseActivityWindow, type ActivityWindow } from '@/lib/organizations/params';

export interface OrganizationFilters {
  searchQuery: string;
  selectedProvinces: string[];
  selectedMunicipalities: string[];
  selectedTypes: string[];
  selectedLanguages: string[];
  /** Activity window: 'all' (default), '28d', or '90d'. */
  activityWindow: ActivityWindow;
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
  selectedProvinces: string[];
  setSelectedProvinces: (value: string[] | null) => Promise<unknown> | void;
  selectedMunicipalities: string[];
  setSelectedMunicipalities: (value: string[] | null) => Promise<unknown> | void;
  selectedTypes: string[];
  setSelectedTypes: (value: string[] | null) => Promise<unknown> | void;
  selectedLanguages: string[];
  setSelectedLanguages: (value: string[] | null) => Promise<unknown> | void;
  activityWindow: ActivityWindow;
  setActivityWindow: (value: ActivityWindow | null) => Promise<unknown> | void;
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
  const [selectedLanguages, setSelectedLanguages] = useQueryState(
    'language',
    parseAsNativeArrayOf(parseAsString).withDefault([]),
  );
  const [activityWindow, setActivityWindow] = useQueryState(
    'activity',
    parseAsStringEnum<ActivityWindow>(['all', '28d', '90d']).withDefault('all'),
  );
  const [currentPage, setCurrentPage] = useQueryState('page', parseAsInteger.withDefault(1));
  // Default to empty string - let the consuming component resolve the actual default based on auth state
  const [sortBy, setSortBy] = useQueryState('sortBy', parseAsString.withDefault(''));

  const typedActivityWindow = parseActivityWindow(activityWindow);

  const filters = useMemo<OrganizationFilters>(
    () => ({
      searchQuery,
      selectedProvinces,
      selectedMunicipalities,
      selectedTypes,
      selectedLanguages,
      activityWindow: typedActivityWindow,
    }),
    [
      searchQuery,
      selectedProvinces,
      selectedMunicipalities,
      selectedTypes,
      selectedLanguages,
      typedActivityWindow,
    ],
  );

  // hasAnyFilters is false at the default state (activity=all, nothing else set)
  const hasAnyFilters = useMemo(
    () =>
      !!searchQuery ||
      selectedProvinces.length > 0 ||
      selectedMunicipalities.length > 0 ||
      selectedTypes.length > 0 ||
      selectedLanguages.length > 0 ||
      typedActivityWindow !== 'all',
    [
      searchQuery,
      selectedProvinces,
      selectedMunicipalities,
      selectedTypes,
      selectedLanguages,
      typedActivityWindow,
    ],
  );

  // Suggested defaults: activity=all, nothing else active
  const isSuggestedDefaults = useMemo(
    () =>
      !searchQuery &&
      selectedProvinces.length === 0 &&
      selectedMunicipalities.length === 0 &&
      selectedTypes.length === 0 &&
      selectedLanguages.length === 0 &&
      typedActivityWindow === 'all',
    [
      searchQuery,
      selectedProvinces,
      selectedMunicipalities,
      selectedTypes,
      selectedLanguages,
      typedActivityWindow,
    ],
  );

  const resetFilters = useCallback(
    () => {
      void setSearchQuery('');
      void setSelectedProvinces([]);
      void setSelectedMunicipalities([]);
      void setSelectedTypes([]);
      void setSelectedLanguages([]);
      void setActivityWindow('all');
      void setCurrentPage(1);
    },
    [
      setSearchQuery,
      setSelectedProvinces,
      setSelectedMunicipalities,
      setSelectedTypes,
      setSelectedLanguages,
      setActivityWindow,
      setCurrentPage,
    ],
  );

  // clearAllFilters: resets everything.
  // applySuggestedDefaults: same as clear.
  const clearAllFilters = useCallback(() => resetFilters(), [resetFilters]);
  const applySuggestedDefaults = clearAllFilters;

  const setActivityWindowAndResetPage = useCallback(
    (value: ActivityWindow | null) => {
      void setActivityWindow(value);
      void setCurrentPage(1);
    },
    [setActivityWindow, setCurrentPage],
  );

  return {
    filters,
    searchQuery,
    setSearchQuery,
    selectedProvinces,
    setSelectedProvinces,
    selectedMunicipalities,
    setSelectedMunicipalities,
    selectedTypes,
    setSelectedTypes,
    selectedLanguages,
    setSelectedLanguages,
    activityWindow: typedActivityWindow,
    setActivityWindow: setActivityWindowAndResetPage,
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
