'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { normalizeWorkTypes, type WorkType } from '@/lib/work-types';
import type { Profile } from '@/lib/supabase/profiles';
import { useProfileSync } from './useProfileSync';
import type { BulletinFilters, JobSortOption, PostedWithinSelection } from '@/lib/bulletin/job-query';
import { useBulletinQueryState } from './useBulletinQueryState';
import { useBulletinFilterActions } from './useBulletinFilterActions';
import { useBulletinPaginationReset } from './useBulletinPaginationReset';

type QueryStateSetter<T> = (value: T) => Promise<unknown> | void;

export interface BulletinFilterControls {
  filters: BulletinFilters;
  searchQuery: string;
  setSearchQuery: QueryStateSetter<string>;
  selectedOrganizations: string[];
  setSelectedOrganizations: QueryStateSetter<string[]>;
  selectedProvinces: string[];
  setSelectedProvinces: QueryStateSetter<string[]>;
  selectedMunicipalities: string[];
  setSelectedMunicipalities: QueryStateSetter<string[]>;
  selectedEmploymentTypes: string[];
  setSelectedEmploymentTypes: QueryStateSetter<string[]>;
  selectedSources: string[];
  setSelectedSources: QueryStateSetter<string[]>;
  selectedWorkTypes: string[];
  setSelectedWorkTypes: QueryStateSetter<string[]>;
  showOnlySse: boolean;
  setShowOnlySse: QueryStateSetter<boolean>;
  showJobsWithoutSalary: boolean;
  setShowJobsWithoutSalary: QueryStateSetter<boolean>;
  postedWithin: PostedWithinSelection;
  setPostedWithin: QueryStateSetter<PostedWithinSelection>;
  filtersExpanded: boolean;
  setFiltersExpanded: (expanded: boolean) => void;
  currentPage: number;
  setCurrentPage: QueryStateSetter<number>;
  allJobsExpanded: boolean;
  setAllJobsExpanded: (expanded: boolean) => void;
  sortBy: JobSortOption;
  setSortBy: QueryStateSetter<JobSortOption>;
  profileWorkTypes: WorkType[];
  isUsingProfileWorkTypes: boolean;
  handleResetToProfileWorkTypes: () => void;
  profileMunicipality: string | null;
  profileProvince: string | null;
  isUsingProfileLocation: boolean;
  handleResetToProfileLocation: () => void;
  hasAnyFilters: boolean;
  clearAllFilters: () => void;
  applySuggestedDefaults: () => void;
}

function hasSameSelections(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

interface UseBulletinFiltersOptions {
  initialProfile?: Profile | null;
  initialUserId?: string | null;
}

export function useBulletinFilters(options: UseBulletinFiltersOptions = {}): BulletinFilterControls {
  const { initialProfile = null, initialUserId = null } = options;
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const userId = authLoading ? initialUserId : (user?.id ?? null);
  const effectiveProfile = userId ? (profile ?? initialProfile ?? null) : null;
  const effectiveProfileLoading = userId ? profileLoading && !initialProfile : false;
  const searchParams = useSearchParams();

  const initialProfileWorkTypes = useMemo(
    () => (initialUserId ? normalizeWorkTypes(initialProfile?.work_types) : []),
    [initialProfile?.work_types, initialUserId],
  );
  const initialProfileProvince = initialUserId && initialProfile?.province ? [initialProfile.province] : [];
  const initialProfileMunicipality =
    initialUserId && initialProfile?.municipality ? [initialProfile.municipality] : [];

  const { filters, state, setters } = useBulletinQueryState(
    initialProfileProvince,
    initialProfileMunicipality,
    initialProfileWorkTypes
  );

  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [allJobsExpanded, setAllJobsExpanded] = useState(true);

  useBulletinPaginationReset(filters, state.sortBy, state.currentPage, setters.setCurrentPage);

  const profileWorkTypes = useMemo(
    () => normalizeWorkTypes(effectiveProfile?.work_types),
    [effectiveProfile?.work_types],
  );
  const normalizedSelectedWorkTypes = useMemo(
    () => normalizeWorkTypes(state.selectedWorkTypes),
    [state.selectedWorkTypes],
  );

  const profileMunicipality = effectiveProfile?.municipality ?? null;
  const profileProvince = effectiveProfile?.province ?? null;

  useProfileSync(userId, effectiveProfileLoading, 'workType', {
    profileValue: profileWorkTypes,
    selectedValue: normalizedSelectedWorkTypes,
    setter: setters.setSelectedWorkTypes,
    shouldSync: (profileValue, selectedValue, hasQueryParam) => {
      if (!profileValue || profileValue.length === 0) return false;
      if (hasQueryParam || selectedValue.length > 0) return false;
      return true;
    },
  });

  useProfileSync(userId, effectiveProfileLoading, 'municipality', {
    profileValue: profileMunicipality && profileProvince ? [profileProvince, profileMunicipality] : null,
    selectedValue: [...state.selectedProvinces, ...state.selectedMunicipalities],
    setter: ([province, municipality]) => {
      void setters.setSelectedProvinces([province]);
      void setters.setSelectedMunicipalities([municipality]);
    },
    shouldSync: (profileValue, selectedValue, hasQueryParam) => {
      if (!profileValue) return false;
      const hasProvinceParam = searchParams?.has('province') ?? false;
      if (hasQueryParam || hasProvinceParam || selectedValue.length > 0) return false;
      return true;
    },
  });

  const {
    clearAllFilters,
    applySuggestedDefaults,
    handleResetToProfileWorkTypes,
    handleResetToProfileLocation,
  } = useBulletinFilterActions(setters, {
    profileWorkTypes,
    profileMunicipality,
    profileProvince,
  });

  const isUsingProfileLocation = useMemo(() => {
    if (!profileMunicipality || !profileProvince) return false;
    return (
      state.selectedMunicipalities.length === 1 &&
      state.selectedMunicipalities[0] === profileMunicipality &&
      state.selectedProvinces.length === 1 &&
      state.selectedProvinces[0] === profileProvince
    );
  }, [profileMunicipality, profileProvince, state.selectedMunicipalities, state.selectedProvinces]);

  const isUsingProfileWorkTypes = useMemo(() => {
    if (profileWorkTypes.length === 0) return false;
    if (normalizedSelectedWorkTypes.length === 0) return false;

    return hasSameSelections(profileWorkTypes, normalizedSelectedWorkTypes);
  }, [normalizedSelectedWorkTypes, profileWorkTypes]);

  const hasAnyFilters =
    !!state.searchQuery ||
    state.selectedOrganizations.length > 0 ||
    state.selectedProvinces.length > 0 ||
    state.selectedMunicipalities.length > 0 ||
    state.selectedEmploymentTypes.length > 0 ||
    state.selectedSources.length > 0 ||
    state.selectedWorkTypes.length > 0 ||
    !state.showOnlySse ||
    !state.showJobsWithoutSalary ||
    state.postedWithin !== 'any';

  return {
    filters,
    searchQuery: state.searchQuery,
    setSearchQuery: setters.setSearchQuery,
    selectedOrganizations: state.selectedOrganizations,
    setSelectedOrganizations: setters.setSelectedOrganizations,
    selectedProvinces: state.selectedProvinces,
    setSelectedProvinces: setters.setSelectedProvinces,
    selectedMunicipalities: state.selectedMunicipalities,
    setSelectedMunicipalities: setters.setSelectedMunicipalities,
    selectedEmploymentTypes: state.selectedEmploymentTypes,
    setSelectedEmploymentTypes: setters.setSelectedEmploymentTypes,
    selectedSources: state.selectedSources,
    setSelectedSources: setters.setSelectedSources,
    selectedWorkTypes: state.selectedWorkTypes,
    setSelectedWorkTypes: setters.setSelectedWorkTypes,
    showOnlySse: state.showOnlySse,
    setShowOnlySse: setters.setShowOnlySse,
    showJobsWithoutSalary: state.showJobsWithoutSalary,
    setShowJobsWithoutSalary: setters.setShowJobsWithoutSalary,
    postedWithin: state.postedWithin,
    setPostedWithin: setters.setPostedWithin,
    filtersExpanded,
    setFiltersExpanded,
    currentPage: state.currentPage,
    setCurrentPage: setters.setCurrentPage,
    allJobsExpanded,
    setAllJobsExpanded,
    sortBy: state.sortBy,
    setSortBy: setters.setSortBy,
    profileWorkTypes,
    isUsingProfileWorkTypes,
    handleResetToProfileWorkTypes,
    profileMunicipality,
    profileProvince,
    isUsingProfileLocation,
    handleResetToProfileLocation,
    hasAnyFilters,
    clearAllFilters,
    applySuggestedDefaults,
  };
}
