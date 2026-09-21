'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ActiveFilterChip } from '@/components/JobSearch';
import { PRODUCT_DEFAULT_POSTED_WITHIN } from '@/lib/bulletin/constants';
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
import { ORG_TYPES } from '@/lib/organizations/constants';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import { SECTORS_LIST } from '@/lib/sectors';
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
  orgTypes: string[];
  sectors: string[];
  provinces: string[];
  employmentTypes: string[];
  sources: string[];
  municipalitiesByProvince: Record<string, string[]>;
  allMunicipalities: string[];
  indeterminateProvinces: Set<string>;
  handleOrgTypeToggle: (orgType: string) => void;
  handleSectorToggle: (sector: string) => void;
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
    selectedOrgTypes,
    setSelectedOrgTypes: onOrgTypesChange,
    selectedSectors,
    setSelectedSectors: onSectorsChange,
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
    showNonSse,
    setShowNonSse: onShowNonSseChange,
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
  const tOrgs = useTranslations('organizations');
  const tSectors = useTranslations('taxonomy.sectors');
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

  const orgTypeLabel = useCallback(
    (type: string) => getOrganizationTypeLabel(type, tOrgs) ?? type,
    [tOrgs],
  );

  const sectorLabel = useCallback(
    (sectorId: string) =>
      tSectors.has(`${sectorId}.label`) ? tSectors(`${sectorId}.label`) : sectorId,
    [tSectors],
  );

  const isSuggestedDefaults =
    !searchQuery &&
    selectedOrganizations.length === 0 &&
    selectedOrgTypes.length === 0 &&
    selectedSectors.length === 0 &&
    selectedProvinces.length === 0 &&
    selectedMunicipalities.length === 0 &&
    selectedEmploymentTypes.length === 0 &&
    selectedSources.length === 0 &&
    selectedLanguages.length === 0 &&
    isWorkTypesDefault &&
    !showNonSse &&
    !showJobsWithoutSalary &&
    postedWithin === PRODUCT_DEFAULT_POSTED_WITHIN;

  const filteredJobsCountResolved = filteredJobsCount ?? 0;
  const totalJobsCountResolved = totalJobsCount ?? 0;

  const activeFilterChips = useMemo(
    () =>
      buildActiveFilterChips(
        {
          postedWithin,
          showNonSse,
          showJobsWithoutSalary,
          searchQuery,
          selectedWorkTypes,
          selectedProvinces,
          selectedMunicipalities,
          selectedOrganizations,
          selectedOrgTypes,
          selectedSectors,
          selectedEmploymentTypes,
          selectedSources,
          selectedLanguages,
          orgTypeLabel,
          sectorLabel,
          onPostedWithinChange,
          onShowNonSseChange,
          onShowJobsWithoutSalaryChange,
          onSearchChange,
          onWorkTypesChange,
          onProvincesChange,
          onMunicipalitiesChange,
          onOrganizationsChange,
          onOrgTypesChange,
          onSectorsChange,
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
      onOrgTypesChange,
      onPostedWithinChange,
      onProvincesChange,
      onSearchChange,
      onSectorsChange,
      onShowJobsWithoutSalaryChange,
      onShowNonSseChange,
      onSourcesChange,
      onWorkTypesChange,
      orgTypeLabel,
      postedWithin,
      searchQuery,
      sectorLabel,
      selectedEmploymentTypes,
      selectedLanguages,
      selectedMunicipalities,
      selectedOrganizations,
      selectedOrgTypes,
      selectedProvinces,
      selectedSectors,
      selectedSources,
      selectedWorkTypes,
      showJobsWithoutSalary,
      showNonSse,
      t,
    ],
  );

  const { provinces, municipalitiesByProvince, employmentTypes, sources, languages } = useMemo(
    () => externalFilterOptions ?? buildFilterOptions(jobs),
    [externalFilterOptions, jobs],
  );

  const orgTypes = useMemo(() => [...ORG_TYPES], []);
  const sectors = useMemo(() => [...SECTORS_LIST], []);

  // When provinces are selected, only show municipalities from those provinces.
  const scopedMunicipalitiesByProvince = useMemo(() => {
    if (selectedProvinces.length === 0) return municipalitiesByProvince;
    const scoped: Record<string, string[]> = {};
    for (const province of selectedProvinces) {
      const munis = municipalitiesByProvince[province];
      if (munis?.length) scoped[province] = munis;
    }
    return scoped;
  }, [municipalitiesByProvince, selectedProvinces]);

  const handleOrgTypeToggle = useCallback(
    (orgType: string) => {
      onOrgTypesChange(toggleSelection(selectedOrgTypes, orgType));
    },
    [onOrgTypesChange, selectedOrgTypes],
  );

  const handleSectorToggle = useCallback(
    (sector: string) => {
      onSectorsChange(toggleSelection(selectedSectors, sector));
    },
    [onSectorsChange, selectedSectors],
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
    () => getAllMunicipalities(scopedMunicipalitiesByProvince),
    [scopedMunicipalitiesByProvince],
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
    orgTypes,
    sectors,
    provinces,
    employmentTypes,
    sources,
    municipalitiesByProvince: scopedMunicipalitiesByProvince,
    allMunicipalities,
    indeterminateProvinces,
    handleOrgTypeToggle,
    handleSectorToggle,
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
