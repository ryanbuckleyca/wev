'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [showOnlySse, setShowOnlySse] = useQueryState('sse', parseAsBoolean.withDefault(true));
  const [showJobsWithoutSalary, setShowJobsWithoutSalary] = useQueryState(
    'salary',
    parseAsBoolean.withDefault(true),
  );
  const [postedWithin, setPostedWithin] = useQueryState(
    'posted',
    parseAsStringLiteral(POSTED_WITHIN_FILTER_OPTIONS).withDefault('2-weeks'),
  );
  const [filtersExpanded, setFiltersExpandedState] = useState(false);
  const [currentPage, setCurrentPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [allJobsExpanded, setAllJobsExpandedState] = useState(true);
  const [sortBy, setSortBy] = useQueryState(
    'sort',
    parseAsStringLiteral(JOB_SORT_OPTIONS).withDefault('date-desc'),
  );
  const appliedProfileWorkTypesUserIdRef = useRef<string | null>(null);
  const appliedProfileLocationUserIdRef = useRef<string | null>(null);

  const profileWorkTypes = useMemo(
    () => normalizeWorkTypes(effectiveProfile?.work_types),
    [effectiveProfile?.work_types],
  );
  const normalizedSelectedWorkTypes = useMemo(
    () => normalizeWorkTypes(selectedWorkTypes),
    [selectedWorkTypes],
  );

  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  useEffect(() => {
    if (!userId) {
      appliedProfileWorkTypesUserIdRef.current = null;
      return;
    }
    if (appliedProfileWorkTypesUserIdRef.current === userId) return;
    if (effectiveProfileLoading) return;

    if (profileWorkTypes.length === 0) {
      appliedProfileWorkTypesUserIdRef.current = userId;
      return;
    }

    const hasWorkTypeParam = searchParamsRef.current?.has('workType') ?? false;
    if (hasWorkTypeParam || selectedWorkTypes.length > 0) {
      appliedProfileWorkTypesUserIdRef.current = userId;
      return;
    }

    console.debug('[useBulletinFilters] applying profile work types', { profileWorkTypes });
    void setSelectedWorkTypes(profileWorkTypes);
    appliedProfileWorkTypesUserIdRef.current = userId;
  }, [
    effectiveProfileLoading,
    userId,
    profileWorkTypes,
    selectedWorkTypes.length,
    setSelectedWorkTypes,
  ]);

  const handleResetToProfileWorkTypes = useCallback(() => {
    if (profileWorkTypes.length === 0) return;
    void setSelectedWorkTypes(profileWorkTypes);
  }, [profileWorkTypes, setSelectedWorkTypes]);

  // Pre-fill municipality + province from profile on first load (same pattern as work type)
  const profileMunicipality = effectiveProfile?.municipality ?? null;
  const profileProvince = effectiveProfile?.province ?? null;

  useEffect(() => {
    if (!userId) {
      appliedProfileLocationUserIdRef.current = null;
      return;
    }
    if (appliedProfileLocationUserIdRef.current === userId) return;
    if (effectiveProfileLoading) return;
    if (!profileMunicipality || !profileProvince) {
      appliedProfileLocationUserIdRef.current = userId;
      return;
    }

    const hasMunicipalityParam = searchParamsRef.current?.has('municipality') ?? false;
    const hasProvinceParam = searchParamsRef.current?.has('province') ?? false;
    if (
      hasMunicipalityParam ||
      hasProvinceParam ||
      selectedMunicipalities.length > 0 ||
      selectedProvinces.length > 0
    ) {
      appliedProfileLocationUserIdRef.current = userId;
      return;
    }

    console.debug('[useBulletinFilters] applying profile location', {
      profileMunicipality,
      profileProvince,
    });
    void setSelectedProvinces([profileProvince]);
    void setSelectedMunicipalities([profileMunicipality]);
    appliedProfileLocationUserIdRef.current = userId;
  }, [
    effectiveProfileLoading,
    userId,
    profileMunicipality,
    profileProvince,
    selectedMunicipalities.length,
    selectedProvinces.length,
    setSelectedMunicipalities,
    setSelectedProvinces,
  ]);

  const handleResetToProfileLocation = useCallback(() => {
    if (!profileMunicipality || !profileProvince) return;
    void setSelectedProvinces([profileProvince]);
    void setSelectedMunicipalities([profileMunicipality]);
  }, [profileMunicipality, profileProvince, setSelectedProvinces, setSelectedMunicipalities]);

  const isUsingProfileLocation = useMemo(() => {
    if (!profileMunicipality || !profileProvince) return false;
    return (
      selectedMunicipalities.length === 1 &&
      selectedMunicipalities[0] === profileMunicipality &&
      selectedProvinces.length === 1 &&
      selectedProvinces[0] === profileProvince
    );
  }, [profileMunicipality, profileProvince, selectedMunicipalities, selectedProvinces]);

  const filters = useMemo<BulletinFilters>(
    () => ({
      searchQuery,
      selectedOrganizations,
      selectedProvinces,
      selectedMunicipalities,
      selectedEmploymentTypes,
      selectedSources,
      selectedWorkTypes,
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

  const setFiltersExpanded = useCallback((expanded: boolean) => {
    setFiltersExpandedState(expanded);
  }, []);

  const setAllJobsExpanded = useCallback((expanded: boolean) => {
    setAllJobsExpandedState(expanded);
  }, []);

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
  };
}
