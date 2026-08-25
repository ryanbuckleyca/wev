'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Leaf1Outlined, Leaf1Solid } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import Collapsible from './Collapsible';
import BooleanFilterRow from './job-filters/BooleanFilterRow';
import CheckboxFilterSection from './job-filters/CheckboxFilterSection';
import FilterButtonGroup from './job-filters/FilterButtonGroup';
import MunicipalityFilterSection from './job-filters/MunicipalityFilterSection';
import OrganizationSearch from './OrganizationSearch';
import {
  buildOrgActiveFilterChips,
  orgLanguageLabel,
  toggleArrayItem,
} from './job-filters/build-org-active-filter-chips';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import type { OrganizationFilterControls } from '@/lib/hooks/useOrganizationFilters';
import type { OrganizationFilterOptions } from '@/lib/organizations/server-data';
import type { ActivityWindow } from '@/lib/organizations/params';

interface OrganizationFiltersProps {
  controls: OrganizationFilterControls;
  filterOptions: OrganizationFilterOptions;
  filteredCount: number;
  totalCount: number;
  loading: boolean;
  filtersExpanded: boolean;
  setFiltersExpanded: (expanded: boolean) => void;
}

export default function OrganizationFilters({
  controls,
  filterOptions,
  filteredCount,
  totalCount,
  loading,
  filtersExpanded,
  setFiltersExpanded,
}: OrganizationFiltersProps) {
  const t = useTranslations('organizations');
  // tJobs reuses the jobs `filters` namespace for province/municipality/chip labels.
  // If those keys are restructured, this component will need to be updated too.
  const tJobs = useTranslations('filters');
  const tSectors = useTranslations('taxonomy.sectors');

  const {
    filters,
    searchQuery,
    setSearchQuery,
    showNonSse,
    setShowNonSse,
    selectedProvinces,
    setSelectedProvinces,
    selectedMunicipalities,
    setSelectedMunicipalities,
    selectedTypes,
    setSelectedTypes,
    selectedLanguages,
    setSelectedLanguages,
    selectedSectors,
    setSelectedSectors,
    setActivityWindow,
    setCurrentPage,
    hasAnyFilters,
    isSuggestedDefaults,
    clearAllFilters,
    applySuggestedDefaults,
  } = controls;

  const activityOptions = useMemo(
    () => [
      { value: 'all', label: t('activityAll') },
      { value: '28d', label: t('activity28d') },
      { value: '90d', label: t('activity90d') },
    ],
    [t],
  );

  const activeFilterChips = buildOrgActiveFilterChips({
    filters,
    onRemoveActivity: () => setActivityWindow('all'),
    onRemoveNonSse: () => setShowNonSse(false),
    onRemoveSearch: () => setSearchQuery(''),
    onRemoveProvince: (p) => setSelectedProvinces(toggleArrayItem(p, selectedProvinces)),
    onRemoveMunicipality: (m) =>
      setSelectedMunicipalities(toggleArrayItem(m, selectedMunicipalities)),
    onRemoveType: (type) => setSelectedTypes(toggleArrayItem(type, selectedTypes)),
    onRemoveLanguage: (language) => {
      void setSelectedLanguages(toggleArrayItem(language, selectedLanguages));
      void setCurrentPage(1);
    },
    onRemoveSector: (sector) => {
      void setSelectedSectors(toggleArrayItem(sector, selectedSectors));
      void setCurrentPage(1);
    },
    tOrgs: t,
    tFilters: tJobs,
    tSectors,
  });

  const totalMunicipalities = Object.values(filterOptions.municipalitiesByProvince).reduce(
    (acc, curr) => acc + curr.length,
    0,
  );

  const availableProvinces = filterOptions.availableProvinces ?? filterOptions.provinces ?? [];
  const availableTypes = filterOptions.availableTypes ?? filterOptions.types ?? [];
  const availableLanguages = filterOptions.availableLanguages ?? filterOptions.languages ?? [];
  const availableSectors = filterOptions.availableSectors ?? filterOptions.sectors ?? [];
  const availableMunicipalitiesByProvince =
    filterOptions.availableMunicipalitiesByProvince ?? filterOptions.municipalitiesByProvince ?? {};

  const disabledProvinces = filterOptions.provinces.filter((p) => !availableProvinces.includes(p));
  const disabledTypes = filterOptions.types.filter((t) => !availableTypes.includes(t));
  const disabledLanguages = filterOptions.languages.filter((l) => !availableLanguages.includes(l));
  const disabledSectors = filterOptions.sectors.filter((s) => !availableSectors.includes(s));
  const disabledMunicipalities = Object.values(filterOptions.municipalitiesByProvince || {})
    .flat()
    .filter((m) => !Object.values(availableMunicipalitiesByProvince).flat().includes(m));

  const disabledTooltipMessage = t('disabledOptionTooltip');

  return (
    <div className="bg-card border border-border rounded-wev-card mb-4 overflow-hidden">
      <OrganizationSearch
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filtersExpanded={filtersExpanded}
        onFiltersExpandedChange={setFiltersExpanded}
        activeFilterChips={activeFilterChips}
        filteredCount={filteredCount}
        totalCount={totalCount}
        loading={loading}
        hasAnyFilters={hasAnyFilters}
        isSuggestedDefaults={isSuggestedDefaults}
        onClearAllFilters={clearAllFilters}
        onApplySuggestedDefaults={applySuggestedDefaults}
      />

      <Collapsible id="org-filters-content" isOpen={filtersExpanded} className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_auto_auto] md:items-start gap-x-4 gap-y-4 mb-2">
          <div className="flex flex-col order-1 md:row-start-1 md:col-start-1 min-h-0 space-y-2">
            <FilterButtonGroup
              label={t('activityLabel')}
              options={activityOptions}
              isSelected={(value) => controls.activityWindow === value}
              onSelect={(value) => controls.setActivityWindow(value as ActivityWindow)}
              className="mb-0"
            />
          </div>

          <div className="flex flex-col order-2 md:row-start-2 md:col-start-1 min-h-0">
            <CheckboxFilterSection
              label={tJobs('province.label')}
              selectedCount={selectedProvinces.length}
              totalCount={filterOptions.provinces.length}
              options={filterOptions.provinces}
              selectedValues={selectedProvinces}
              disabledValues={disabledProvinces}
              disabledTooltipMessage={disabledTooltipMessage}
              onToggle={(val) => setSelectedProvinces(toggleArrayItem(val, selectedProvinces))}
              emptyMessage={tJobs('province.noData')}
            />
          </div>

          <div className="flex flex-col order-3 md:row-start-3 md:col-start-1 min-h-0">
            <MunicipalityFilterSection
              label={tJobs('municipality.label')}
              selectedMunicipalities={selectedMunicipalities}
              totalMunicipalities={totalMunicipalities}
              selectedProvinces={selectedProvinces}
              municipalitiesByProvince={filterOptions.municipalitiesByProvince}
              disabledMunicipalities={disabledMunicipalities}
              disabledTooltipMessage={disabledTooltipMessage}
              onToggleMunicipality={(val) =>
                setSelectedMunicipalities(toggleArrayItem(val, selectedMunicipalities))
              }
              noDataMessage={tJobs('municipality.noData')}
              selectProvinceMessage={tJobs('municipality.selectProvince')}
              showingFromSelectedMessage={tJobs('municipality.showingFromSelected')}
            />
          </div>

          <div className="flex flex-col order-4 md:row-start-1 md:col-start-2 min-h-0">
            <CheckboxFilterSection
              label={t('organizationType')}
              selectedCount={selectedTypes.length}
              totalCount={filterOptions.types.length}
              options={filterOptions.types}
              selectedValues={selectedTypes}
              disabledValues={disabledTypes}
              disabledTooltipMessage={disabledTooltipMessage}
              onToggle={(val) => setSelectedTypes(toggleArrayItem(val, selectedTypes))}
              emptyMessage={t('noOrganizationTypes')}
              renderLabel={(type) => getOrganizationTypeLabel(type, t)}
            />
          </div>

          <div className="flex flex-col order-5 md:row-start-2 md:col-start-2 min-h-0">
            <CheckboxFilterSection
              label={tJobs('language.label')}
              selectedCount={selectedLanguages.length}
              totalCount={filterOptions.languages.length}
              options={filterOptions.languages}
              selectedValues={selectedLanguages}
              disabledValues={disabledLanguages}
              disabledTooltipMessage={disabledTooltipMessage}
              onToggle={(val) => {
                void setSelectedLanguages(toggleArrayItem(val, selectedLanguages));
                void setCurrentPage(1);
              }}
              emptyMessage={tJobs('language.noData')}
              renderLabel={(lang) => orgLanguageLabel(lang, tJobs)}
            />
          </div>

          <div className="flex flex-col order-6 md:row-start-3 md:col-start-2 min-h-0">
            <CheckboxFilterSection
              label={t('sector')}
              selectedCount={selectedSectors.length}
              totalCount={filterOptions.sectors.length}
              options={filterOptions.sectors}
              selectedValues={selectedSectors}
              disabledValues={disabledSectors}
              disabledTooltipMessage={disabledTooltipMessage}
              onToggle={(val) => {
                void setSelectedSectors(toggleArrayItem(val, selectedSectors));
                void setCurrentPage(1);
              }}
              emptyMessage={t('noOrganizationSectors')}
              renderLabel={(sectorId) => tSectors(`${sectorId}.label`)}
            />
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
