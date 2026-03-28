'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { Leaf1Outlined, Leaf1Solid, CheckOutlined } from '@lineiconshq/free-icons';
import JobSearch, { ActiveFilterChip } from './JobSearch';
import Collapsible from './Collapsible';
import FilterIcon from './FilterIcon';
import StyledLink from './StyledLink';
import { JobPosting } from '@/lib/supabase';
import { truncateMiddle } from '@/lib/string-utils';
import { WORK_TYPES, normalizeWorkTypes, type WorkType } from '@/lib/work-types';
import { Checkbox } from './ui/Checkbox';
import {
  buildFilterOptions,
  getAllMunicipalities,
  getIndeterminateProvinces,
  getVisibleMunicipalitiesByProvince,
  toggleMunicipalitySelection,
  toggleProvinceSelection,
  toggleSelection,
} from '@/lib/bulletin/filter-options';
import type { PostedWithinSelection } from '@/lib/bulletin/job-query';

type PostedWithinOption = '1-week' | '2-weeks' | '3-weeks' | '1-month';

type PostedWithinLabel = {
  fullKey: string;
  shortKey: string;
  fallbackShort: string;
};

const postedWithinOptions: Record<PostedWithinOption, PostedWithinLabel> = {
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

interface JobFiltersProps {
  jobs: JobPosting[];
  filteredJobsCount?: number;
  totalJobsCount?: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedOrganizations: string[];
  onOrganizationsChange: (orgs: string[]) => void;
  selectedProvinces: string[];
  onProvincesChange: (provinces: string[]) => void;
  selectedMunicipalities: string[];
  onMunicipalitiesChange: (municipalities: string[]) => void;
  selectedEmploymentTypes: string[];
  onEmploymentTypesChange: (types: string[]) => void;
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
  selectedWorkTypes: string[];
  onWorkTypesChange: (types: string[]) => void;
  showOnlySse: boolean;
  onShowOnlySseChange: (show: boolean) => void;
  showJobsWithoutSalary: boolean;
  onShowJobsWithoutSalaryChange: (show: boolean) => void;
  postedWithin: PostedWithinSelection;
  onPostedWithinChange: (value: PostedWithinSelection) => void;
  filtersExpanded: boolean;
  onFiltersExpandedChange: (expanded: boolean) => void;
  profileWorkTypes?: WorkType[];
  isUsingProfileWorkTypes?: boolean;
  onResetToProfileWorkTypes?: () => void;
}

export default function JobFilters({
  jobs,
  filteredJobsCount,
  totalJobsCount,
  searchQuery,
  onSearchChange,
  selectedOrganizations,
  onOrganizationsChange,
  selectedProvinces,
  onProvincesChange,
  selectedMunicipalities,
  onMunicipalitiesChange,
  selectedEmploymentTypes,
  onEmploymentTypesChange,
  selectedSources,
  onSourcesChange,
  selectedWorkTypes,
  onWorkTypesChange,
  showOnlySse,
  onShowOnlySseChange,
  showJobsWithoutSalary,
  onShowJobsWithoutSalaryChange,
  postedWithin,
  onPostedWithinChange,
  filtersExpanded,
  onFiltersExpandedChange,
  profileWorkTypes = [],
  isUsingProfileWorkTypes = false,
  onResetToProfileWorkTypes,
}: JobFiltersProps) {
  const t = useTranslations();
  const hasProfileWorkTypes = profileWorkTypes.length > 0;
  const defaultWorkTypes = hasProfileWorkTypes ? profileWorkTypes : [];
  const normalizedSelectedWorkTypes = normalizeWorkTypes(selectedWorkTypes);
  const isWorkTypesDefault =
    defaultWorkTypes.length === normalizedSelectedWorkTypes.length &&
    defaultWorkTypes.every((workType) => normalizedSelectedWorkTypes.includes(workType));
  const profileWorkTypeLabel = hasProfileWorkTypes
    ? profileWorkTypes
        .map((wt) => {
          if (wt === 'remote') return t('filters.workType.remote');
          if (wt === 'hybrid') return t('filters.workType.hybrid');
          return t('filters.workType.office');
        })
        .join(', ')
    : '';
  const hasAnyFilters =
    !!searchQuery ||
    selectedOrganizations.length > 0 ||
    selectedProvinces.length > 0 ||
    selectedMunicipalities.length > 0 ||
    selectedEmploymentTypes.length > 0 ||
    selectedSources.length > 0 ||
    selectedWorkTypes.length > 0 ||
    showOnlySse ||
    !showJobsWithoutSalary ||
    postedWithin !== 'any';

  const isSuggestedDefaults =
    !searchQuery &&
    selectedOrganizations.length === 0 &&
    selectedProvinces.length === 0 &&
    selectedMunicipalities.length === 0 &&
    selectedEmploymentTypes.length === 0 &&
    selectedSources.length === 0 &&
    isWorkTypesDefault &&
    showOnlySse &&
    showJobsWithoutSalary &&
    postedWithin === '2-weeks';

  const filteredJobsCountResolved = filteredJobsCount ?? jobs.length;
  const totalJobsCountResolved = totalJobsCount ?? jobs.length;

  const getTranslationOrFallback = useCallback(
    (key: string, fallback: string) => {
      const translation = t(key);
      return translation === key ? fallback : translation;
    },
    [t],
  );

  const activeFilterChips = useMemo(() => {
    const chips: ActiveFilterChip[] = [];

    if (postedWithin !== 'any') {
      const option = postedWithinOptions[postedWithin as PostedWithinOption];
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

    if (selectedWorkTypes.length > 0) {
      const workLabel =
        selectedWorkTypes.length <= 2
          ? selectedWorkTypes
              .map((wt) => {
                if (wt === 'remote') return t('filters.workType.remote');
                if (wt === 'hybrid') return t('filters.workType.hybrid');
                if (wt === 'office') return t('filters.workType.office');
                return wt.charAt(0).toUpperCase() + wt.slice(1);
              })
              .join(', ')
          : `${selectedWorkTypes.length} ${t('filters.chips.selected')}`;
      chips.push({
        id: 'work-types',
        label: workLabel,
        onRemove: () => onWorkTypesChange([]),
      });
    }

    const MAX_TAG_LENGTH = 20;
    const pushSelectionChips = (
      keyPrefix: string,
      items: string[],
      labelFn: (item: string) => string,
      onRemoveFn: (item: string) => void,
    ) => {
      items.forEach((item) => {
        const fullLabel = labelFn(item);
        chips.push({
          id: `${keyPrefix}-${item}`,
          label: truncateMiddle(fullLabel, MAX_TAG_LENGTH),
          title: fullLabel,
          onRemove: () => onRemoveFn(item),
        });
      });
    };

    if (selectedProvinces.length > 0) {
      pushSelectionChips(
        'province',
        selectedProvinces,
        (province) => province,
        (province) => onProvincesChange(selectedProvinces.filter((p) => p !== province)),
      );
    }

    if (selectedMunicipalities.length > 0) {
      pushSelectionChips(
        'municipality',
        selectedMunicipalities,
        (municipality) => municipality,
        (municipality) =>
          onMunicipalitiesChange(selectedMunicipalities.filter((m) => m !== municipality)),
      );
    }

    if (selectedOrganizations.length > 0) {
      pushSelectionChips(
        'organization',
        selectedOrganizations,
        (organization) => organization,
        (organization) =>
          onOrganizationsChange(selectedOrganizations.filter((o) => o !== organization)),
      );
    }

    if (selectedEmploymentTypes.length > 0) {
      const translateWorkType = (type: string) => {
        if (type === 'remote') return t('filters.workType.remote');
        if (type === 'hybrid') return t('filters.workType.hybrid');
        if (type === 'office') return t('filters.workType.office');
        return type;
      };
      pushSelectionChips('employment-type', selectedEmploymentTypes, translateWorkType, (type) =>
        onEmploymentTypesChange(selectedEmploymentTypes.filter((t) => t !== type)),
      );
    }

    if (selectedSources.length > 0) {
      pushSelectionChips(
        'source',
        selectedSources,
        (source) => source,
        (source) => onSourcesChange(selectedSources.filter((s) => s !== source)),
      );
    }

    return chips;
  }, [
    getTranslationOrFallback,
    onEmploymentTypesChange,
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
    selectedMunicipalities,
    selectedOrganizations,
    selectedProvinces,
    selectedSources,
    selectedWorkTypes,
    showJobsWithoutSalary,
    showOnlySse,
    t,
  ]);

  // Extract unique values for filter options
  const { organizations, provinces, municipalitiesByProvince, employmentTypes, sources } =
    useMemo(() => buildFilterOptions(jobs), [jobs]);

  const handleOrganizationToggle = (org: string) => {
    onOrganizationsChange(toggleSelection(selectedOrganizations, org));
  };

  const handleProvinceToggle = (province: string) => {
    const next = toggleProvinceSelection({
      province,
      selectedProvinces,
      selectedMunicipalities,
      municipalitiesByProvince,
    });

    onProvincesChange(next.provinces);
    onMunicipalitiesChange(next.municipalities);
  };

  const handleMunicipalityToggle = (municipality: string) => {
    onMunicipalitiesChange(toggleMunicipalitySelection(selectedMunicipalities, municipality));
  };

  const handleEmploymentTypeToggle = (type: string) => {
    onEmploymentTypesChange(toggleSelection(selectedEmploymentTypes, type));
  };

  const handleSourceToggle = (source: string) => {
    onSourcesChange(toggleSelection(selectedSources, source));
  };

  const handleWorkTypeToggle = (workType: WorkType) => {
    onWorkTypesChange(toggleSelection(selectedWorkTypes, workType));
  };

  const clearAllFilters = () => {
    onSearchChange('');
    onOrganizationsChange([]);
    onProvincesChange([]);
    onMunicipalitiesChange([]);
    onEmploymentTypesChange([]);
    onSourcesChange([]);
    onWorkTypesChange([]);
    onShowOnlySseChange(false);
    onShowJobsWithoutSalaryChange(true);
    onPostedWithinChange('any');
  };

  const applySuggestedDefaults = () => {
    onSearchChange('');
    onOrganizationsChange([]);
    onProvincesChange([]);
    onMunicipalitiesChange([]);
    onEmploymentTypesChange([]);
    onSourcesChange([]);
    onWorkTypesChange(defaultWorkTypes);
    onShowOnlySseChange(true);
    onShowJobsWithoutSalaryChange(true);
    onPostedWithinChange('2-weeks');
  };

  // Get municipalities to display based on selected provinces
  // Shows: municipalities from selected provinces + any already-selected municipalities
  const visibleMunicipalitiesByProvince = useMemo(
    () =>
      getVisibleMunicipalitiesByProvince({
        municipalitiesByProvince,
        selectedProvinces,
        selectedMunicipalities,
      }),
    [municipalitiesByProvince, selectedProvinces, selectedMunicipalities],
  );

  // Get all municipalities for count
  const allMunicipalities = useMemo(
    () => getAllMunicipalities(municipalitiesByProvince),
    [municipalitiesByProvince],
  );

  // Calculate which provinces are in indeterminate state (some but not all municipalities selected)
  const indeterminateProvinces = useMemo(
    () =>
      getIndeterminateProvinces({
        provinces,
        municipalitiesByProvince,
        selectedMunicipalities,
      }),
    [provinces, municipalitiesByProvince, selectedMunicipalities],
  );

  return (
    <div className="bg-card border border-border rounded-wev-card mb-4 overflow-hidden">
      <JobSearch
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        filtersExpanded={filtersExpanded}
        onFiltersExpandedChange={onFiltersExpandedChange}
        activeFilterChips={activeFilterChips}
        filteredJobsCount={filteredJobsCountResolved}
        totalJobsCount={totalJobsCountResolved}
        hasAnyFilters={hasAnyFilters}
        isSuggestedDefaults={isSuggestedDefaults}
        onClearAllFilters={clearAllFilters}
        onApplySuggestedDefaults={applySuggestedDefaults}
      />

      {/* Collapsible Filters Section */}
      <Collapsible isOpen={filtersExpanded} className="p-6">
        {/* SSE filter */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={showOnlySse}
              onChange={(e) => onShowOnlySseChange(e.target.checked)}
            />
            <Lineicons
              icon={showOnlySse ? Leaf1Solid : Leaf1Outlined}
              size={16}
              className="shrink-0 text-primary"
              aria-hidden
            />
            <span className="text-sm font-semibold text-foreground">{t('filters.sse.label')}</span>
          </label>
          <p className="text-xs text-muted-foreground mt-1 pl-7">
            {t('filters.sse.description')}
            <a
              href="https://solidarityeconomyprinciples.org/wp-content/uploads/2023/02/SE-Principles-2-pager-handout.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-wev-brand-accent hover:text-wev-primary-text hover:underline"
            >
              {t('filters.sse.learnMore')}
            </a>
          </p>
        </div>

        {/* Jobs without salary filter */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={showJobsWithoutSalary}
              onChange={(e) => onShowJobsWithoutSalaryChange(e.target.checked)}
            />
            <span className="text-sm font-semibold text-foreground">
              {t('filters.salary.label')}
            </span>
          </label>
          <p className="text-xs text-muted-foreground mt-1 pl-7">
            {t('filters.salary.description')}
          </p>
        </div>

        {/* Posted within filter */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('filters.postedWithin.label')}
          </label>
          <div className="flex flex-wrap gap-2">
            {(['1-week', '2-weeks', '3-weeks', '1-month', 'any'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onPostedWithinChange(value)}
                className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
                  postedWithin === value
                    ? 'bg-primary text-white'
                    : 'bg-background text-foreground border border-border hover:bg-primary-tint'
                }`}
              >
                {value === '1-week'
                  ? t('filters.postedWithin.options.1Week')
                  : value === '2-weeks'
                    ? t('filters.postedWithin.options.2Weeks')
                    : value === '3-weeks'
                      ? t('filters.postedWithin.options.3Weeks')
                      : value === '1-month'
                        ? t('filters.postedWithin.options.1Month')
                        : t('filters.postedWithin.options.any')}
              </button>
            ))}
          </div>
        </div>

        {/* Work Type Filter */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('filters.workType.label')}
          </label>
          {hasProfileWorkTypes && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {isUsingProfileWorkTypes
                  ? t('filters.workType.profileDefault', { types: profileWorkTypeLabel })
                  : t('filters.workType.profileOverride', { types: profileWorkTypeLabel })}
              </span>
              <StyledLink href="/profile" variant="text" size="sm" className="p-0">
                {t('filters.workType.profileLink')}
              </StyledLink>
              {!isUsingProfileWorkTypes && onResetToProfileWorkTypes && (
                <button
                  type="button"
                  onClick={onResetToProfileWorkTypes}
                  className="text-[var(--primary)] hover:underline"
                >
                  {t('filters.workType.profileReset')}
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            {WORK_TYPES.map((workType) => {
              const isSelected = selectedWorkTypes.includes(workType);
              const label =
                workType === 'remote'
                  ? t('filters.workType.remote')
                  : workType === 'hybrid'
                    ? t('filters.workType.hybrid')
                    : t('filters.workType.office');
              return (
                <button
                  key={workType}
                  type="button"
                  onClick={() => handleWorkTypeToggle(workType)}
                  className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary text-white'
                      : 'bg-background text-foreground border border-border hover:bg-primary-tint'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_auto_auto] md:items-start gap-x-4 gap-y-4 mb-2">
          {/* Provinces */}
          <div className="flex flex-col order-1 md:row-start-1 md:col-start-1 min-h-0">
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('filters.province.label')} ({selectedProvinces.length}/{provinces.length})
            </label>
            <div className="max-h-32 overflow-y-auto border border-border rounded-wev-btn p-2 bg-background">
              {provinces.length > 0 ? (
                provinces.map((province) => {
                  return (
                    <label
                      key={province}
                      className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-primary-tint rounded px-2 transition-colors"
                    >
                      <Checkbox
                        checked={selectedProvinces.includes(province)}
                        indeterminate={indeterminateProvinces.has(province)}
                        onChange={() => handleProvinceToggle(province)}
                      />
                      <span className="text-sm text-foreground">{province}</span>
                    </label>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground italic px-2 py-2">
                  {t('filters.province.noData')}
                </p>
              )}
            </div>
          </div>

          {/* Employment Types */}
          <div className="flex flex-col order-3 md:row-start-1 md:col-start-2 min-h-0">
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('filters.employmentType.label')} ({selectedEmploymentTypes.length}/
              {employmentTypes.length})
            </label>
            <div className="max-h-32 overflow-y-auto border border-border rounded-wev-btn p-2 bg-background">
              {employmentTypes.length > 0 ? (
                employmentTypes.map((type) => (
                  <label
                    key={type}
                    className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-primary-tint rounded px-2 transition-colors"
                  >
                    <Checkbox
                      checked={selectedEmploymentTypes.includes(type)}
                      onChange={() => handleEmploymentTypeToggle(type)}
                    />
                    <span className="text-sm text-foreground">{type}</span>
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic px-2 py-2">
                  {t('filters.employmentType.noData')}
                </p>
              )}
            </div>
          </div>

          {/* Municipalities (grouped by province, filtered by selected provinces) */}
          <div className="flex flex-col order-2 md:row-start-2 md:col-start-1">
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('filters.municipality.label')} ({selectedMunicipalities.length}/
              {allMunicipalities.length})
              {selectedProvinces.length > 0 && allMunicipalities.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  {t('filters.municipality.showingFromSelected')}
                </span>
              )}
            </label>
            <div className="h-48 overflow-y-auto border border-border rounded-wev-btn p-2 bg-background">
              {allMunicipalities.length === 0 ? (
                <p className="text-sm text-muted-foreground italic px-2 py-2">
                  {t('filters.municipality.noData')}
                </p>
              ) : Object.keys(visibleMunicipalitiesByProvince).length === 0 ? (
                <p className="text-sm text-muted-foreground italic px-2 py-2">
                  {t('filters.municipality.selectProvince')}
                </p>
              ) : (
                Object.entries(visibleMunicipalitiesByProvince).map(
                  ([province, municipalities]) => {
                    const isProvinceSelected = selectedProvinces.includes(province);
                    return (
                      <div key={province} className="mb-2">
                        <div
                          className={`text-xs font-semibold mb-1 px-2 flex items-center gap-1 ${
                            isProvinceSelected ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        >
                          {province}
                          {isProvinceSelected && (
                            <Lineicons icon={CheckOutlined} size={11} className="flex-shrink-0" />
                          )}
                        </div>
                        {municipalities.map((municipality) => {
                          const isSelected = selectedMunicipalities.includes(municipality);
                          const isFromSelectedProvince = isProvinceSelected;
                          return (
                            <label
                              key={`${province}-${municipality}`}
                              className={`flex items-center space-x-2 py-1 cursor-pointer rounded px-2 ml-2 transition-colors ${
                                isFromSelectedProvince
                                  ? 'hover:bg-primary-tint'
                                  : 'hover:bg-background opacity-75'
                              }`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onChange={() => handleMunicipalityToggle(municipality)}
                              />
                              <span
                                className={`text-sm ${
                                  isFromSelectedProvince
                                    ? 'text-foreground'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {municipality}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    );
                  },
                )
              )}
            </div>
          </div>

          {/* Organizations */}
          <div className="flex flex-col order-4 md:row-start-2 md:col-start-2">
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('filters.organization.label')} ({selectedOrganizations.length}/
              {organizations.length})
            </label>
            <div className="h-48 overflow-y-auto border border-border rounded-wev-btn p-2 bg-background">
              {organizations.length > 0 ? (
                organizations.map((org) => (
                  <label
                    key={org}
                    className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-primary-tint rounded px-2 transition-colors"
                  >
                    <Checkbox
                      checked={selectedOrganizations.includes(org)}
                      onChange={() => handleOrganizationToggle(org)}
                    />
                    <span className="text-sm text-foreground">{org}</span>
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic px-2 py-2">
                  {t('filters.organization.noData')}
                </p>
              )}
            </div>
          </div>

          {/* Sources */}
          <div className="flex flex-col order-5 md:row-start-3 md:col-start-1">
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('filters.source.label')} ({selectedSources.length}/{sources.length})
            </label>
            <div className="max-h-32 overflow-y-auto border border-border rounded-wev-btn p-2 bg-background">
              {sources.length > 0 ? (
                sources.map((source) => (
                  <label
                    key={source}
                    className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-primary-tint rounded px-2 transition-colors"
                  >
                    <Checkbox
                      checked={selectedSources.includes(source)}
                      onChange={() => handleSourceToggle(source)}
                    />
                    <span className="text-sm text-foreground">{source}</span>
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic px-2 py-2">
                  {t('filters.source.noData')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Collapse indicator at bottom */}
        <div className="mt-6 relative h-2 shadow-top flex items-center justify-center border-t border-border">
          <button
            type="button"
            onClick={() => onFiltersExpandedChange(false)}
            className="absolute -top-3 flex items-center justify-center w-8 h-6 bg-card border border-border rounded-full shadow-sm transition-all group"
            aria-label={t('filters.hideFilters')}
          >
            <FilterIcon
              className="w-4 h-4 text-wev-text-tertiary group-hover:text-muted-foreground transition-colors"
              reversed
            />
          </button>
        </div>
      </Collapsible>
    </div>
  );
}
