'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ActiveFilterChip } from '@/components/JobSearch';
import {
  buildFilterOptions,
  getAllMunicipalities,
  getIndeterminateProvinces,
  getVisibleMunicipalitiesByProvince,
  toggleMunicipalitySelection,
  toggleProvinceSelection,
  toggleSelection,
} from '@/lib/bulletin/filter-options';
import { truncateMiddle } from '@/lib/string-utils';
import { WORK_TYPES, normalizeWorkTypes, type WorkType } from '@/lib/work-types';
import type { JobFiltersProps } from './types';
import { useBulletinFilterContext } from '@/contexts/BulletinFilterContext';

type PostedWithinOption = '1-week' | '2-weeks' | '3-weeks' | '1-month';

type PostedWithinLabel = {
  fullKey: string;
  shortKey: string;
  fallbackShort: string;
};

const postedWithinChipOptions: Record<PostedWithinOption, PostedWithinLabel> = {
  '1-week': {
    fullKey: 'filters.postedWithin.options.1Week',
    shortKey: 'filters.postedWithin.short.1Week',
    fallbackShort: '1 wk',
  },
  '2-weeks': {
    fullKey: 'filters.postedWithin.options.2Weeks',
    shortKey: 'filters.postedWithin.short.2Weeks',
    fallbackShort: '2 wks',
  },
  '3-weeks': {
    fullKey: 'filters.postedWithin.options.3Weeks',
    shortKey: 'filters.postedWithin.short.3Weeks',
    fallbackShort: '3 wks',
  },
  '1-month': {
    fullKey: 'filters.postedWithin.options.1Month',
    shortKey: 'filters.postedWithin.short.1Month',
    fallbackShort: '1 mo',
  },
};

const postedWithinButtonValues = ['1-week', '2-weeks', '3-weeks', '1-month', 'any'] as const;
const MAX_TAG_LENGTH = 20;
const EMPTY_WORK_TYPES: WorkType[] = [];

function buildSelectionChips(
  keyPrefix: string,
  items: string[],
  labelForItem: (item: string) => string,
  onRemoveItem: (item: string) => void,
): ActiveFilterChip[] {
  return items.map((item) => {
    const fullLabel = labelForItem(item);

    return {
      id: `${keyPrefix}-${item}`,
      label: truncateMiddle(fullLabel, MAX_TAG_LENGTH),
      title: fullLabel,
      onRemove: () => onRemoveItem(item),
    };
  });
}

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
  visibleMunicipalitiesByProvince: Record<string, string[]>;
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

  const getTranslationOrFallback = useCallback(
    (key: string, fallback: string) => {
      const translation = t(key);
      return translation === key ? fallback : translation;
    },
    [t],
  );

  const getWorkTypeLabel = useCallback(
    (workType: string) => {
      if (workType === 'remote') return t('filters.workType.remote');
      if (workType === 'hybrid') return t('filters.workType.hybrid');
      if (workType === 'office') return t('filters.workType.office');
      return workType.charAt(0).toUpperCase() + workType.slice(1);
    },
    [t],
  );

  const isWorkTypesDefault =
    defaultWorkTypes.length === normalizedSelectedWorkTypes.length &&
    defaultWorkTypes.every((workType) => normalizedSelectedWorkTypes.includes(workType));

  const profileWorkTypeLabel = useMemo(
    () => profileWorkTypes.map((workType) => getWorkTypeLabel(workType)).join(', '),
    [getWorkTypeLabel, profileWorkTypes],
  );

  const hasProfileLanguages = profileLanguages.length > 0;

  const profileLanguageLabel = useMemo(() => {
    const getLangLabel = (lang: string) => {
      if (lang === 'en') return t('filters.language.en');
      if (lang === 'fr') return t('filters.language.fr');
      if (lang === 'bilingual') return t('filters.language.bilingual');
      return lang;
    };
    return profileLanguages.map(getLangLabel).join(', ');
  }, [profileLanguages, t]);

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

  const activeFilterChips = useMemo(() => {
    const chips: ActiveFilterChip[] = [];

    if (postedWithin !== 'any') {
      const option = postedWithinChipOptions[postedWithin as PostedWithinOption];
      const fullLabel = `${t('filters.chips.posted')} ${t(option.fullKey)}`;
      const shortLabel = getTranslationOrFallback(option.shortKey, option.fallbackShort);

      chips.push({
        id: 'posted-within',
        label: shortLabel,
        title: fullLabel,
        onRemove: () => onPostedWithinChange('any'),
      });
    }

    if (showOnlySse) {
      chips.push({
        id: 'sse',
        label: getTranslationOrFallback('filters.chips.sseShort', 'SSE'),
        title: t('filters.chips.sseOnly'),
        onRemove: () => onShowOnlySseChange(false),
      });
    }

    if (!showJobsWithoutSalary) {
      chips.push({
        id: 'salary',
        label: t('filters.chips.salaryListedOnly'),
        onRemove: () => onShowJobsWithoutSalaryChange(true),
      });
    }

    if (searchQuery) {
      const truncated = searchQuery.length > 24 ? `${searchQuery.slice(0, 24)}…` : searchQuery;
      chips.push({
        id: 'search',
        label: `"${truncated}"`,
        title: `${t('filters.chips.search')} "${truncated}"`,
        onRemove: () => onSearchChange(''),
      });
    }

    chips.push(
      ...buildSelectionChips(
        'work-type',
        selectedWorkTypes,
        (workType) => getWorkTypeLabel(workType),
        (workType) => onWorkTypesChange(selectedWorkTypes.filter((item) => item !== workType)),
      ),
    );

    chips.push(
      ...buildSelectionChips(
        'province',
        selectedProvinces,
        (province) => province,
        (province) => onProvincesChange(selectedProvinces.filter((item) => item !== province)),
      ),
    );
    chips.push(
      ...buildSelectionChips(
        'municipality',
        selectedMunicipalities,
        (municipality) => municipality,
        (municipality) =>
          onMunicipalitiesChange(selectedMunicipalities.filter((item) => item !== municipality)),
      ),
    );
    chips.push(
      ...buildSelectionChips(
        'organization',
        selectedOrganizations,
        (organization) => organization,
        (organization) =>
          onOrganizationsChange(selectedOrganizations.filter((item) => item !== organization)),
      ),
    );
    chips.push(
      ...buildSelectionChips(
        'employment-type',
        selectedEmploymentTypes,
        (employmentType) => getWorkTypeLabel(employmentType),
        (employmentType) =>
          onEmploymentTypesChange(
            selectedEmploymentTypes.filter((item) => item !== employmentType),
          ),
      ),
    );
    chips.push(
      ...buildSelectionChips(
        'source',
        selectedSources,
        (source) => source,
        (source) => onSourcesChange(selectedSources.filter((item) => item !== source)),
      ),
    );
    chips.push(
      ...buildSelectionChips(
        'language',
        selectedLanguages,
        (lang) => {
          if (lang === 'en') return t('filters.language.en');
          if (lang === 'fr') return t('filters.language.fr');
          if (lang === 'bilingual') return t('filters.language.bilingual');
          return lang;
        },
        (lang) => onLanguagesChange(selectedLanguages.filter((item) => item !== lang)),
      ),
    );

    return chips;
  }, [
    getTranslationOrFallback,
    getWorkTypeLabel,
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
  ]);

  const { organizations, provinces, municipalitiesByProvince, employmentTypes, sources } = useMemo(
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

  const visibleMunicipalitiesByProvince = useMemo(
    () =>
      getVisibleMunicipalitiesByProvince({
        municipalitiesByProvince,
        selectedProvinces,
        selectedMunicipalities,
      }),
    [municipalitiesByProvince, selectedMunicipalities, selectedProvinces],
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
    () => WORK_TYPES.map((workType) => ({ value: workType, label: getWorkTypeLabel(workType) })),
    [getWorkTypeLabel],
  );

  const languageOptions = useMemo(
    () => [
      { value: 'en', label: t('filters.language.en') },
      { value: 'fr', label: t('filters.language.fr') },
      { value: 'bilingual', label: t('filters.language.bilingual') },
    ],
    [t],
  );

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
    visibleMunicipalitiesByProvince,
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
