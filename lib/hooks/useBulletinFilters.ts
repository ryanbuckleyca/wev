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
}

function hasSameSelections(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

export function useBulletinFilters(): BulletinFilterControls {
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [selectedOrganizations, setSelectedOrganizations] = useQueryState(
    'org',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedProvinces, setSelectedProvinces] = useQueryState(
    'province',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedMunicipalities, setSelectedMunicipalities] = useQueryState(
    'municipality',
    parseAsArrayOf(parseAsString).withDefault([]),
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
    parseAsArrayOf(parseAsString).withDefault([]),
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

  const profileWorkTypes = useMemo(
    () => normalizeWorkTypes(profile?.work_types),
    [profile?.work_types],
  );
  const normalizedSelectedWorkTypes = useMemo(
    () => normalizeWorkTypes(selectedWorkTypes),
    [selectedWorkTypes],
  );

  useEffect(() => {
    if (!user?.id) {
      appliedProfileWorkTypesUserIdRef.current = null;
      return;
    }
    if (appliedProfileWorkTypesUserIdRef.current === user.id) return;
    if (profileLoading) return;

    if (profileWorkTypes.length === 0) {
      appliedProfileWorkTypesUserIdRef.current = user.id;
      return;
    }

    const hasWorkTypeParam = searchParams?.has('workType') ?? false;
    if (hasWorkTypeParam || selectedWorkTypes.length > 0) {
      appliedProfileWorkTypesUserIdRef.current = user.id;
      return;
    }

    void setSelectedWorkTypes(profileWorkTypes);
    appliedProfileWorkTypesUserIdRef.current = user.id;
  }, [
    user?.id,
    profileLoading,
    profileWorkTypes,
    searchParams,
    selectedWorkTypes.length,
    setSelectedWorkTypes,
  ]);

  const handleResetToProfileWorkTypes = useCallback(() => {
    if (profileWorkTypes.length === 0) return;
    void setSelectedWorkTypes(profileWorkTypes);
  }, [profileWorkTypes, setSelectedWorkTypes]);

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
  };
}
