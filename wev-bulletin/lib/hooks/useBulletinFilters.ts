'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { normalizeWorkTypes, type WorkType } from '@/lib/work-types';
import type { Profile } from '@/lib/supabase/profiles';
import { useProfileSync } from './useProfileSync';
import {
  JOB_SORT_OPTIONS,
  POSTED_WITHIN_FILTER_OPTIONS,
  type BulletinFilters,
  type JobSortOption,
  type PostedWithinSelection,
} from '@/lib/bulletin/job-query';

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
  selectedLanguages: string[];
  setSelectedLanguages: QueryStateSetter<string[]>;
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
  profileLanguages: string[];
  isUsingProfileLanguages: boolean;
  handleResetToProfileLanguages: () => void;
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

export function useBulletinFilters(
  options: UseBulletinFiltersOptions = {},
): BulletinFilterControls {
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
  const initialProfileProvince =
    initialUserId && initialProfile?.province ? [initialProfile.province] : [];
  const initialProfileMunicipality =
    initialUserId && initialProfile?.municipality ? [initialProfile.municipality] : [];

  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [selectedOrganizations, setSelectedOrganizations] = useQueryState(
    'org',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedProvinces, setSelectedProvinces] = useQueryState(
    'province',
    parseAsArrayOf(parseAsString).withDefault(initialProfileProvince),
  );
  const [selectedMunicipalities, setSelectedMunicipalities] = useQueryState(
    'municipality',
    parseAsArrayOf(parseAsString).withDefault(initialProfileMunicipality),
  );
  const [selectedEmploymentTypes, setSelectedEmploymentTypes] = useQueryState(
    'employment',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedSources, setSelectedSources] = useQueryState(
    'source',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedWorkTypes, setSelectedWorkTypes] = useQueryState(
    'workType',
    parseAsArrayOf(parseAsString).withDefault(initialProfileWorkTypes),
  );
  const [langQuery, setLangQuery] = useQueryState(
    'lang',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  const selectedLanguages = useMemo(() => {
    if (langQuery && langQuery.length > 0) return langQuery;
    const legacyLangs = searchParams?.getAll('langs') ?? [];
    if (legacyLangs.length > 0) {
      return legacyLangs.flatMap((l) => l.split(',')).filter(Boolean);
    }
    return [];
  }, [langQuery, searchParams]);

  const setSelectedLanguages = useCallback(
    (value: string[]) => {
      void setLangQuery(value.length > 0 ? value : null);
    },
    [setLangQuery],
  );
  const [showOnlySse, setShowOnlySse] = useQueryState('sse', parseAsBoolean.withDefault(true));
  const [showJobsWithoutSalary, setShowJobsWithoutSalary] = useQueryState(
    'salary',
    parseAsBoolean.withDefault(true),
  );
  const [postedWithin, setPostedWithin] = useQueryState(
    'posted',
    parseAsStringLiteral(POSTED_WITHIN_FILTER_OPTIONS).withDefault('2-weeks'),
  );
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [allJobsExpanded, setAllJobsExpanded] = useState(true);
  const [sortBy, setSortBy] = useQueryState(
    'sort',
    parseAsStringLiteral(JOB_SORT_OPTIONS).withDefault('date-desc'),
  );

  const profileWorkTypes = useMemo(
    () => normalizeWorkTypes(effectiveProfile?.work_types),
    [effectiveProfile?.work_types],
  );
  const normalizedSelectedWorkTypes = useMemo(
    () => normalizeWorkTypes(selectedWorkTypes),
    [selectedWorkTypes],
  );

  const profileMunicipality = effectiveProfile?.municipality ?? null;
  const profileProvince = effectiveProfile?.province ?? null;

  const profileLanguages = useMemo(
    () => effectiveProfile?.preferred_languages ?? [],
    [effectiveProfile?.preferred_languages],
  );

  // Sync work types from profile on first load
  useProfileSync(userId, effectiveProfileLoading, 'workType', {
    profileValue: profileWorkTypes,
    selectedValue: normalizedSelectedWorkTypes,
    setter: setSelectedWorkTypes,
    shouldSync: (profileValue, selectedValue, hasQueryParam) => {
      if (!profileValue || profileValue.length === 0) return false;
      if (hasQueryParam || selectedValue.length > 0) return false;
      return true;
    },
  });

  // Sync location from profile on first load
  useProfileSync(userId, effectiveProfileLoading, 'municipality', {
    profileValue:
      profileMunicipality && profileProvince ? [profileProvince, profileMunicipality] : null,
    selectedValue: [...selectedProvinces, ...selectedMunicipalities],
    setter: ([province, municipality]) => {
      void setSelectedProvinces([province]);
      void setSelectedMunicipalities([municipality]);
    },
    shouldSync: (profileValue, selectedValue, hasQueryParam) => {
      if (!profileValue) return false;
      const hasProvinceParam = searchParams?.has('province') ?? false;
      if (hasQueryParam || hasProvinceParam || selectedValue.length > 0) return false;
      return true;
    },
  });

  // Sync language preference from profile on first load
  useProfileSync(userId, effectiveProfileLoading, 'lang', {
    profileValue: profileLanguages,
    selectedValue: selectedLanguages,
    shouldSync: (profileValue, selectedValue, hasQueryParam) => {
      if (!profileValue || profileValue.length === 0) return false;
      if (hasQueryParam || selectedValue.length > 0) return false;
      return true;
    },
    setter: setSelectedLanguages,
  });

  const handleResetToProfileWorkTypes = useCallback(() => {
    if (profileWorkTypes.length === 0) return;
    void setSelectedWorkTypes(profileWorkTypes);
  }, [profileWorkTypes, setSelectedWorkTypes]);

  const handleResetToProfileLocation = useCallback(() => {
    if (!profileMunicipality || !profileProvince) return;
    void setSelectedProvinces([profileProvince]);
    void setSelectedMunicipalities([profileMunicipality]);
  }, [profileMunicipality, profileProvince, setSelectedProvinces, setSelectedMunicipalities]);

  const handleResetToProfileLanguages = useCallback(() => {
    if (profileLanguages.length === 0) return;
    void setSelectedLanguages(profileLanguages);
  }, [profileLanguages, setSelectedLanguages]);

  const isUsingProfileLocation = useMemo(() => {
    if (!profileMunicipality || !profileProvince) return false;
    return (
      selectedMunicipalities.length === 1 &&
      selectedMunicipalities[0] === profileMunicipality &&
      selectedProvinces.length === 1 &&
      selectedProvinces[0] === profileProvince
    );
  }, [profileMunicipality, profileProvince, selectedMunicipalities, selectedProvinces]);

  const isUsingProfileLanguages = useMemo(() => {
    if (profileLanguages.length === 0) return false;
    if (selectedLanguages.length === 0) return false;
    return hasSameSelections(profileLanguages, selectedLanguages);
  }, [profileLanguages, selectedLanguages]);

  const filters = useMemo<BulletinFilters>(
    () => ({
      searchQuery,
      selectedOrganizations,
      selectedProvinces,
      selectedMunicipalities,
      selectedEmploymentTypes,
      selectedSources,
      selectedWorkTypes,
      selectedLanguages,
      showOnlySse,
      showJobsWithoutSalary,
      postedWithin,
    }),
    [
      searchQuery,
      selectedOrganizations,
      selectedProvinces,
      selectedMunicipalities,
      selectedEmploymentTypes,
      selectedSources,
      selectedWorkTypes,
      selectedLanguages,
      showOnlySse,
      showJobsWithoutSalary,
      postedWithin,
    ],
  );

  const isUsingProfileWorkTypes = useMemo(() => {
    if (profileWorkTypes.length === 0) return false;
    if (normalizedSelectedWorkTypes.length === 0) return false;

    return hasSameSelections(profileWorkTypes, normalizedSelectedWorkTypes);
  }, [normalizedSelectedWorkTypes, profileWorkTypes]);

  const hasAnyFilters =
    !!searchQuery ||
    selectedOrganizations.length > 0 ||
    selectedProvinces.length > 0 ||
    selectedMunicipalities.length > 0 ||
    selectedEmploymentTypes.length > 0 ||
    selectedSources.length > 0 ||
    selectedWorkTypes.length > 0 ||
    selectedLanguages.length > 0 ||
    showOnlySse ||
    !showJobsWithoutSalary ||
    postedWithin !== 'any';

  // Shared reset: clears every filter field back to its blank/empty value.
  // clearAllFilters and applySuggestedDefaults both call this, then override
  // the fields that differ between the two operations.
  const resetCommonFilters = useCallback(() => {
    void setSearchQuery('');
    void setSelectedOrganizations([]);
    void setSelectedProvinces([]);
    void setSelectedMunicipalities([]);
    void setSelectedEmploymentTypes([]);
    void setSelectedSources([]);
    void setSelectedLanguages([]);
  }, [
    setSearchQuery,
    setSelectedOrganizations,
    setSelectedProvinces,
    setSelectedMunicipalities,
    setSelectedEmploymentTypes,
    setSelectedSources,
    setSelectedLanguages,
  ]);

  const clearAllFilters = useCallback(() => {
    resetCommonFilters();
    void setSelectedWorkTypes([]);
    void setShowOnlySse(false);
    void setShowJobsWithoutSalary(true);
    void setPostedWithin('any');
  }, [
    resetCommonFilters,
    setSelectedWorkTypes,
    setShowOnlySse,
    setShowJobsWithoutSalary,
    setPostedWithin,
  ]);

  const applySuggestedDefaults = useCallback(() => {
    resetCommonFilters();
    void setSelectedWorkTypes(profileWorkTypes);
    void setShowOnlySse(true);
    void setShowJobsWithoutSalary(true);
    void setPostedWithin('2-weeks');
  }, [
    resetCommonFilters,
    profileWorkTypes,
    setSelectedWorkTypes,
    setShowOnlySse,
    setShowJobsWithoutSalary,
    setPostedWithin,
  ]);

  return {
    filters,
    searchQuery,
    setSearchQuery,
    selectedOrganizations,
    setSelectedOrganizations,
    selectedProvinces,
    setSelectedProvinces,
    selectedMunicipalities,
    setSelectedMunicipalities,
    selectedEmploymentTypes,
    setSelectedEmploymentTypes,
    selectedSources,
    setSelectedSources,
    selectedWorkTypes,
    setSelectedWorkTypes,
    selectedLanguages,
    setSelectedLanguages,
    showOnlySse,
    setShowOnlySse,
    showJobsWithoutSalary,
    setShowJobsWithoutSalary,
    postedWithin,
    setPostedWithin,
    filtersExpanded,
    setFiltersExpanded,
    currentPage,
    setCurrentPage,
    allJobsExpanded,
    setAllJobsExpanded,
    sortBy,
    setSortBy,
    profileWorkTypes,
    isUsingProfileWorkTypes,
    handleResetToProfileWorkTypes,
    profileMunicipality,
    profileProvince,
    isUsingProfileLocation,
    handleResetToProfileLocation,
    profileLanguages,
    isUsingProfileLanguages,
    handleResetToProfileLanguages,
    hasAnyFilters,
    clearAllFilters,
    applySuggestedDefaults,
  };
}
