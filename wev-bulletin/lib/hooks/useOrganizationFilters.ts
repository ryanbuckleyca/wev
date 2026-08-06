'use client';

import { useMemo, useCallback } from 'react';
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsNativeArrayOf,
  parseAsString,
  useQueryState,
} from 'nuqs';
import type { ActivityWindow } from '@/lib/organizations/params';

export interface OrganizationFilters {
  searchQuery: string;
  /** When true, non-SSE orgs are included. Default is false (SSE-only view). */
  showNonSse: boolean;
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
  showNonSse: boolean;
  setShowNonSse: (value: boolean | null) => Promise<unknown> | void;
  selectedProvinces: string[];
  setSelectedProvinces: (value: string[] | null) => Promise<unknown> | void;
  selectedMunicipalities: string[];
  setSelectedMunicipalities: (value: string[] | null) => Promise<unknown> | void;
  selectedTypes: string[];
  setSelectedTypes: (value: string[] | null) => Promise<unknown> | void;
  selectedLanguages: string[];
  setSelectedLanguages: (value: string[] | null) => Promise<unknown> | void;
  activityWindow: ActivityWindow;
  setActivityWindow: (value: string | null) => Promise<unknown> | void;
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
  const [selectedLanguages, setSelectedLanguages] = useQueryState(
    'language',
    parseAsNativeArrayOf(parseAsString).withDefault([]),
  );
  const [activityWindow, setActivityWindow] = useQueryState(
    'activity',
    parseAsString.withDefault('all'),
  );
  const [currentPage, setCurrentPage] = useQueryState('page', parseAsInteger.withDefault(1));
  // Default to empty string - let the consuming component resolve the actual default based on auth state
  const [sortBy, setSortBy] = useQueryState('sortBy', parseAsString.withDefault(''));

  const typedActivityWindow = (
    activityWindow === '28d' || activityWindow === '90d' ? activityWindow : 'all'
  ) as ActivityWindow;

  const filters = useMemo<OrganizationFilters>(
    () => ({
      searchQuery,
      showNonSse,
      selectedProvinces,
      selectedMunicipalities,
      selectedTypes,
      selectedLanguages,
      activityWindow: typedActivityWindow,
    }),
    [
      searchQuery,
      showNonSse,
      selectedProvinces,
      selectedMunicipalities,
      selectedTypes,
      selectedLanguages,
      typedActivityWindow,
    ],
  );

  // hasAnyFilters is false at the default state (showNonSse=false, activity=all, nothing else set)
  const hasAnyFilters = useMemo(
    () =>
      !!searchQuery ||
      showNonSse ||
      selectedProvinces.length > 0 ||
      selectedMunicipalities.length > 0 ||
      selectedTypes.length > 0 ||
      selectedLanguages.length > 0 ||
      typedActivityWindow !== 'all',
    [
      searchQuery,
      showNonSse,
      selectedProvinces,
      selectedMunicipalities,
      selectedTypes,
      selectedLanguages,
      typedActivityWindow,
    ],
  );

  // Suggested defaults: showNonSse off (SSE-only), activity=all, nothing else active
  const isSuggestedDefaults = useMemo(
    () =>
      !searchQuery &&
      !showNonSse &&
      selectedProvinces.length === 0 &&
      selectedMunicipalities.length === 0 &&
      selectedTypes.length === 0 &&
      selectedLanguages.length === 0 &&
      typedActivityWindow === 'all',
    [
      searchQuery,
      showNonSse,
      selectedProvinces,
      selectedMunicipalities,
      selectedTypes,
      selectedLanguages,
      typedActivityWindow,
    ],
  );

  const resetFilters = useCallback(
    (nonSseDefault: boolean) => {
      void setSearchQuery('');
      void setShowNonSse(nonSseDefault);
      void setSelectedProvinces([]);
      void setSelectedMunicipalities([]);
      void setSelectedTypes([]);
      void setSelectedLanguages([]);
      void setActivityWindow('all');
      void setCurrentPage(1);
    },
    [
      setSearchQuery,
      setShowNonSse,
      setSelectedProvinces,
      setSelectedMunicipalities,
      setSelectedTypes,
      setSelectedLanguages,
      setActivityWindow,
      setCurrentPage,
    ],
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
    selectedLanguages,
    setSelectedLanguages,
    activityWindow: typedActivityWindow,
    setActivityWindow,
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
