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
import { normalizeLanguages } from '@/lib/languages';
import type { Profile } from '@/lib/supabase/profiles';
import { useProfileFilterDefaults } from './useProfileFilterDefaults';
import { PRODUCT_DEFAULT_POSTED_WITHIN } from '@/lib/bulletin/constants';
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
  /**
   * True once the initial filter state is final: either the URL as provided, or
   * profile defaults have been seeded into the URL. Gate the first data fetch on
   * this so the page never fetches/renders the unseeded filter set.
   */
  filtersReady: boolean;
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
  const [showJobsWithoutSalary, setShowJobsWithoutSalary] = useQueryState(
    'salary',
    parseAsBoolean.withDefault(false),
  );
  const [postedWithin, setPostedWithin] = useQueryState(
    'posted',
    parseAsStringLiteral(POSTED_WITHIN_FILTER_OPTIONS).withDefault(PRODUCT_DEFAULT_POSTED_WITHIN),
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
    () => normalizeLanguages(effectiveProfile?.preferred_languages),
    [effectiveProfile?.preferred_languages],
  );

  // Seed profile-based default filters into the URL exactly once per visit, then
  // never again. After seeding, the URL is the sole source of truth, so clearing
  // a filter stays cleared. `filtersReady` latches true once the initial filter
  // state is final (URL as-is, or seeded defaults landed).
  const profileSeed = useMemo(
    () => ({
      workTypes: profileWorkTypes,
      province: profileProvince,
      municipality: profileMunicipality,
      languages: profileLanguages,
    }),
    [profileWorkTypes, profileProvince, profileMunicipality, profileLanguages],
  );

  const currentSeedState = useMemo(
    () => ({
      workTypes: normalizedSelectedWorkTypes,
      provinces: selectedProvinces,
      municipalities: selectedMunicipalities,
      languages: selectedLanguages,
    }),
    [normalizedSelectedWorkTypes, selectedProvinces, selectedMunicipalities, selectedLanguages],
  );

  const seedSetters = useMemo(
    () => ({
      setWorkTypes: (value: string[]) => void setSelectedWorkTypes(value),
      setProvinces: (value: string[]) => void setSelectedProvinces(value),
      setMunicipalities: (value: string[]) => void setSelectedMunicipalities(value),
      setLanguages: (value: string[]) => setSelectedLanguages(value),
    }),
    [setSelectedWorkTypes, setSelectedProvinces, setSelectedMunicipalities, setSelectedLanguages],
  );

  const filtersReady = useProfileFilterDefaults({
    enabled: !!userId,
    resolved: !effectiveProfileLoading,
    seed: profileSeed,
    current: currentSeedState,
    setters: seedSetters,
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
      showJobsWithoutSalary,
      postedWithin,
    ],
  );

  const isUsingProfileWorkTypes = useMemo(() => {
    if (profileWorkTypes.length === 0) return false;
    if (normalizedSelectedWorkTypes.length === 0) return false;

    return hasSameSelections(profileWorkTypes, normalizedSelectedWorkTypes);
  }, [normalizedSelectedWorkTypes, profileWorkTypes]);

  // Product defaults (SSE-only, hide jobs without salary, 2-week window) are not
  // "active filters". Deviating from those defaults (including postedWithin=any) is.
  const hasAnyFilters =
    !!searchQuery ||
    selectedOrganizations.length > 0 ||
    selectedProvinces.length > 0 ||
    selectedMunicipalities.length > 0 ||
    selectedEmploymentTypes.length > 0 ||
    selectedSources.length > 0 ||
    selectedWorkTypes.length > 0 ||
    selectedLanguages.length > 0 ||
    showJobsWithoutSalary ||
    postedWithin !== PRODUCT_DEFAULT_POSTED_WITHIN;

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

  // Restores the SSE/compensation/posted-within product baseline (the "not a
  // filter" defaults shared by Clear and Suggested).
  const applyProductBaseline = useCallback(() => {
    void setShowJobsWithoutSalary(false);
    void setPostedWithin(PRODUCT_DEFAULT_POSTED_WITHIN);
  }, [setShowJobsWithoutSalary, setPostedWithin]);

  const clearAllFilters = useCallback(() => {
    resetCommonFilters();
    void setSelectedWorkTypes([]);
    applyProductBaseline();
  }, [resetCommonFilters, setSelectedWorkTypes, applyProductBaseline]);

  const applySuggestedDefaults = useCallback(() => {
    resetCommonFilters();
    void setSelectedWorkTypes(profileWorkTypes);
    applyProductBaseline();
  }, [resetCommonFilters, profileWorkTypes, setSelectedWorkTypes, applyProductBaseline]);

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
    filtersReady,
  };
}
