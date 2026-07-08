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
  showOnlySse: boolean;
  selectedProvinces: string[];
  selectedMunicipalities: string[];
  selectedTypes: string[];
}

export interface OrganizationFilterControls {
  filters: OrganizationFilters;
  searchQuery: string;
  setSearchQuery: (value: string | null) => Promise<unknown> | void;
  showOnlySse: boolean;
  setShowOnlySse: (value: boolean | null) => Promise<unknown> | void;
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
  clearAllFilters: () => void;
}

export function useOrganizationFilters(): OrganizationFilterControls {
  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [showOnlySse, setShowOnlySse] = useQueryState('sse', parseAsBoolean.withDefault(true));
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
      showOnlySse,
      selectedProvinces,
      selectedMunicipalities,
      selectedTypes,
    }),
    [searchQuery, showOnlySse, selectedProvinces, selectedMunicipalities, selectedTypes],
  );

  const hasAnyFilters =
    !!searchQuery ||
    showOnlySse ||
    selectedProvinces.length > 0 ||
    selectedMunicipalities.length > 0 ||
    selectedTypes.length > 0;

  const clearAllFilters = useCallback(() => {
    void setSearchQuery('');
    void setShowOnlySse(false);
    void setSelectedProvinces([]);
    void setSelectedMunicipalities([]);
    void setSelectedTypes([]);
    void setCurrentPage(1);
  }, [
    setSearchQuery,
    setShowOnlySse,
    setSelectedProvinces,
    setSelectedMunicipalities,
    setSelectedTypes,
    setCurrentPage,
  ]);

  return {
    filters,
    searchQuery,
    setSearchQuery,
    showOnlySse,
    setShowOnlySse,
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
    clearAllFilters,
  };
}
