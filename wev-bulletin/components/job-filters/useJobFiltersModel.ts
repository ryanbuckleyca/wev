'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ActiveFilterChip } from '@/components/JobSearch';
import {
  buildFilterOptions,
  getAllMunicipalities,
  getIndeterminateProvinces,
  toggleMunicipalitySelection,
  toggleProvinceSelection,
  toggleSelection,
} from '@/lib/bulletin/filter-options';
import {
  buildJobLanguageOptions,
  getJobLanguageLabel,
  getWorkTypeLabel,
} from '@/lib/bulletin/filter-labels';
import { WORK_TYPES, normalizeWorkTypes, type WorkType } from '@/lib/work-types';
import type { JobFiltersProps } from './types';
import { useBulletinFilterContext } from '@/contexts/BulletinFilterContext';
import { buildActiveFilterChips } from './build-active-filter-chips';
import {
  postedWithinButtonValues,
  postedWithinChipOptions,
  type PostedWithinOption,
} from './posted-within-options';

const EMPTY_WORK_TYPES: WorkType[] = [];

export interface JobFiltersModel {
  activeFilterChips: ActiveFilterChip[];
  filteredJobsCountResolved: number;
  totalJobsCountResolved: number;
  hasAnyFilters: boolean;
  isSuggestedDefaults: boolean;
  hasProfileWorkTypes: boolean;
  profileWorkTypeLabel: string;
  hasProfileLanguages: boolean;
  profileLanguageLabel: string;
  workTypeOptions: { value: string; label: string }[];
  languageOptions: { value: string; label: string }[];
  postedWithinOptions: { value: string; label: string }[];
  organizations: string[];
  provinces: string[];
  employmentTypes: string[];
  sources: string[];
  municipalitiesByProvince: Record<string, string[]>;
  allMunicipalities: string[];
  indeterminateProvinces: Set<string>;
  handleOrganizationToggle: (organization: string) => void;
  handleProvinceToggle: (province: string) => void;
  handleMunicipalityToggle: (municipality: string) => void;
  handleEmploymentTypeToggle: (employmentType: string) => void;
  handleSourceToggle: (source: string) => void;
  handleWorkTypeToggle: (workType: WorkType) => void;
  handleLanguageToggle: (lang: string) => void;
  clearAllFilters: () => void;
  applySuggestedDefaults: () => void;
}

export function useJobFiltersModel({
  jobs,
  filterOptions: externalFilterOptions,
  filteredJobsCount,
  totalJobsCount,
}: JobFiltersProps): JobFiltersModel {
  const controls = useBulletinFilterContext();
  const {
    searchQuery,
    setSearchQuery: onSearchChange,
    selectedOrganizations,
    setSelectedOrganizations: onOrganizationsChange,
    selectedProvinces,
    setSelectedProvinces: onProvincesChange,
    selectedMunicipalities,
    setSelectedMunicipalities: onMunicipalitiesChange,
    selectedEmploymentTypes,
    setSelectedEmploymentTypes: onEmploymentTypesChange,
    selectedSources,
    setSelectedSources: onSourcesChange,
    selectedWorkTypes,
    setSelectedWorkTypes: onWorkTypesChange,
    selectedLanguages = [],
    setSelectedLanguages: onLanguagesChange,
    showOnlySse,
    setShowOnlySse: onShowOnlySseChange,
    showJobsWithoutSalary,
    setShowJobsWithoutSalary: onShowJobsWithoutSalaryChange,
    postedWithin,
    setPostedWithin: onPostedWithinChange,
    profileWorkTypes = [],
    profileLanguages = [],
    hasAnyFilters,
    clearAllFilters,
    applySuggestedDefaults,
  } = controls;
  const t = useTranslations();
  const hasProfileWorkTypes = profileWorkTypes.length > 0;
  const defaultWorkTypes = hasProfileWorkTypes ? profileWorkTypes : EMPTY_WORK_TYPES;
  const normalizedSelectedWorkTypes = normalizeWorkTypes(selectedWorkTypes);

  const isWorkTypesDefault =
    defaultWorkTypes.length === normalizedSelectedWorkTypes.length &&
    defaultWorkTypes.every((workType) => normalizedSelectedWorkTypes.includes(workType));

  const profileWorkTypeLabel = useMemo(
    () => profileWorkTypes.map((workType) => getWorkTypeLabel(workType, t)).join(', '),
    [profileWorkTypes, t],
  );

  const hasProfileLanguages = profileLanguages.length > 0;

  const profileLanguageLabel = useMemo(
    () => profileLanguages.map((lang) => getJobLanguageLabel(lang, t)).join(', '),
    [profileLanguages, t],
  );

  const isSuggestedDefaults =
    !searchQuery &&
    selectedOrganizations.length === 0 &&
    selectedProvinces.length === 0 &&
    selectedMunicipalities.length === 0 &&
    selectedEmploymentTypes.length === 0 &&
    selectedSources.length === 0 &&
    selectedLanguages.length === 0 &&
    isWorkTypesDefault &&
    showOnlySse &&
    showJobsWithoutSalary &&
    postedWithin === '2-weeks';

  const filteredJobsCountResolved = filteredJobsCount ?? 0;
  const totalJobsCountResolved = totalJobsCount ?? 0;

  const activeFilterChips = useMemo(
    () =>
      buildActiveFilterChips(
        {
          postedWithin,
          showOnlySse,
          showJobsWithoutSalary,
          searchQuery,
          selectedWorkTypes,
          selectedProvinces,
          selectedMunicipalities,
          selectedOrganizations,
          selectedEmploymentTypes,
          selectedSources,
          selectedLanguages,
          onPostedWithinChange,
          onShowOnlySseChange,
          onShowJobsWithoutSalaryChange,
          onSearchChange,
          onWorkTypesChange,
          onProvincesChange,
          onMunicipalitiesChange,
          onOrganizationsChange,
          onEmploymentTypesChange,
          onSourcesChange,
          onLanguagesChange,
        },
        t,
      ),
    [
      onEmploymentTypesChange,
      onLanguagesChange,
      onMunicipalitiesChange,
      onOrganizationsChange,
      onPostedWithinChange,
      onProvincesChange,
      onSearchChange,
      onShowJobsWithoutSalaryChange,
      onShowOnlySseChange,
      onSourcesChange,
      onWorkTypesChange,
      postedWithin,
      searchQuery,
      selectedEmploymentTypes,
      selectedLanguages,
      selectedMunicipalities,
      selectedOrganizations,
      selectedProvinces,
      selectedSources,
      selectedWorkTypes,
      showJobsWithoutSalary,
      showOnlySse,
      t,
    ],
  );

  const {
    organizations,
    provinces,
    municipalitiesByProvince,
    employmentTypes,
    sources,
    languages,
  } = useMemo(
    () => externalFilterOptions ?? buildFilterOptions(jobs),
    [externalFilterOptions, jobs],
  );

  const handleOrganizationToggle = useCallback(
    (organization: string) => {
      onOrganizationsChange(toggleSelection(selectedOrganizations, organization));
    },
    [onOrganizationsChange, selectedOrganizations],
  );

  const handleProvinceToggle = useCallback(
    (province: string) => {
      const nextSelection = toggleProvinceSelection({
        province,
        selectedProvinces,
        selectedMunicipalities,
        municipalitiesByProvince,
      });

      onProvincesChange(nextSelection.provinces);
      onMunicipalitiesChange(nextSelection.municipalities);
    },
    [
      municipalitiesByProvince,
      onMunicipalitiesChange,
      onProvincesChange,
      selectedMunicipalities,
      selectedProvinces,
    ],
  );

  const handleMunicipalityToggle = useCallback(
    (municipality: string) => {
      onMunicipalitiesChange(toggleMunicipalitySelection(selectedMunicipalities, municipality));
    },
    [onMunicipalitiesChange, selectedMunicipalities],
  );

  const handleEmploymentTypeToggle = useCallback(
    (employmentType: string) => {
      onEmploymentTypesChange(toggleSelection(selectedEmploymentTypes, employmentType));
    },
    [onEmploymentTypesChange, selectedEmploymentTypes],
  );

  const handleSourceToggle = useCallback(
    (source: string) => {
      onSourcesChange(toggleSelection(selectedSources, source));
    },
    [onSourcesChange, selectedSources],
  );

  const handleWorkTypeToggle = useCallback(
    (workType: WorkType) => {
      onWorkTypesChange(toggleSelection(selectedWorkTypes, workType));
    },
    [onWorkTypesChange, selectedWorkTypes],
  );

  const handleLanguageToggle = useCallback(
    (lang: string) => {
      onLanguagesChange(toggleSelection(selectedLanguages, lang));
    },
    [onLanguagesChange, selectedLanguages],
  );

  const allMunicipalities = useMemo(
    () => getAllMunicipalities(municipalitiesByProvince),
    [municipalitiesByProvince],
  );

  const indeterminateProvinces = useMemo(
    () =>
      getIndeterminateProvinces({
        provinces,
        municipalitiesByProvince,
        selectedMunicipalities,
      }),
    [municipalitiesByProvince, provinces, selectedMunicipalities],
  );

  const workTypeOptions = useMemo(
    () => WORK_TYPES.map((workType) => ({ value: workType, label: getWorkTypeLabel(workType, t) })),
    [t],
  );

  const languageOptions = useMemo(() => buildJobLanguageOptions(languages, t), [languages, t]);

  const postedWithinOptions = useMemo(
    () =>
      postedWithinButtonValues.map((value) => ({
        value,
        label:
          value === 'any'
            ? t('filters.postedWithin.options.any')
            : t(postedWithinChipOptions[value as PostedWithinOption].fullKey),
      })),
    [t],
  );

  return {
    activeFilterChips,
    filteredJobsCountResolved,
    totalJobsCountResolved,
    hasAnyFilters,
    isSuggestedDefaults,
    hasProfileWorkTypes,
    profileWorkTypeLabel,
    hasProfileLanguages,
    profileLanguageLabel,
    workTypeOptions,
    languageOptions,
    postedWithinOptions,
    organizations,
    provinces,
    employmentTypes,
    sources,
    municipalitiesByProvince,
    allMunicipalities,
    indeterminateProvinces,
    handleOrganizationToggle,
    handleProvinceToggle,
    handleMunicipalityToggle,
    handleEmploymentTypeToggle,
    handleSourceToggle,
    handleWorkTypeToggle,
    handleLanguageToggle,
    clearAllFilters,
    applySuggestedDefaults,
  };
}
