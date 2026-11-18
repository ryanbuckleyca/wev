'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Collapsible from './Collapsible';
import CheckboxFilterSection from './job-filters/CheckboxFilterSection';
import {
  FILTER_LIST_BOX_CLASS,
  FILTER_LIST_BOX_COMPACT_CLASS,
} from './job-filters/filter-list-box';

import MunicipalityFilterSection from './job-filters/MunicipalityFilterSection';
import RadioFilterSection from './job-filters/RadioFilterSection';
import OrganizationSearch from './OrganizationSearch';
import {
  buildOrgActiveFilterChips,
  orgLanguageLabel,
  toggleArrayItem,
} from './job-filters/build-org-active-filter-chips';
import { getGovernanceCategoryLabel } from '@/lib/organizations/governance-labels';
import { SSE_GOVERNANCE_FILTER_CATEGORIES } from '@/lib/organizations/governance-taxonomy';
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
    selectedLanguages,
    setSelectedLanguages,
    selectedSectors,
    setSelectedSectors,
    selectedGovernanceCategories,
    setSelectedGovernanceCategories,
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
    onRemoveLanguage: (language) => {
      void setSelectedLanguages(toggleArrayItem(language, selectedLanguages));
      void setCurrentPage(1);
    },
    onRemoveSector: (sector) => {
      void setSelectedSectors(toggleArrayItem(sector, selectedSectors));
      void setCurrentPage(1);
    },
    onRemoveGovernance: (category) => {
      void setSelectedGovernanceCategories(toggleArrayItem(category, selectedGovernanceCategories));
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
  const governanceOptions = useMemo(() => {
    const fromRpc = filterOptions.governanceCategories ?? [];
    const present = new Set(fromRpc);
    // Stable GOV_1..GOV_5 order; hide categories with no organizations.
    return SSE_GOVERNANCE_FILTER_CATEGORIES.filter((code) => present.has(code));
  }, [filterOptions.governanceCategories]);
  const availableGovernanceCategories =
    filterOptions.availableGovernanceCategories ?? filterOptions.governanceCategories ?? [];
  const availableLanguages = filterOptions.availableLanguages ?? filterOptions.languages ?? [];
  const availableSectors = filterOptions.availableSectors ?? filterOptions.sectors ?? [];
  const availableMunicipalitiesByProvince =
    filterOptions.availableMunicipalitiesByProvince ?? filterOptions.municipalitiesByProvince ?? {};

  const disabledProvinces = filterOptions.provinces.filter((p) => !availableProvinces.includes(p));
  const disabledGovernanceCategories = governanceOptions.filter(
    (code) => !availableGovernanceCategories.includes(code),
  );
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
          <div className="flex flex-col min-h-0">
            <RadioFilterSection
              label={t('activityLabel')}
              name="org-activity"
              options={activityOptions}
              selectedValue={controls.activityWindow}
              onSelect={(value) => controls.setActivityWindow(value as ActivityWindow)}
              listClassName={FILTER_LIST_BOX_COMPACT_CLASS}
            />
          </div>

          <div className="flex flex-col min-h-0">
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
              listClassName={FILTER_LIST_BOX_COMPACT_CLASS}
              renderLabel={(lang) => orgLanguageLabel(lang, tJobs)}
            />
          </div>

          <div className="flex flex-col min-h-0">
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
              listClassName={FILTER_LIST_BOX_CLASS}
            />
          </div>

          <div className="flex flex-col min-h-0">
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
              listClassName={FILTER_LIST_BOX_CLASS}
              noDataMessage={tJobs('municipality.noData')}
              selectProvinceMessage={tJobs('municipality.selectProvince')}
              showingFromSelectedMessage={tJobs('municipality.showingFromSelected')}
            />
          </div>

          <div className="flex flex-col min-h-0">
            <CheckboxFilterSection
              label={t('governanceFilter')}
              selectedCount={selectedGovernanceCategories.length}
              totalCount={governanceOptions.length}
              options={governanceOptions}
              selectedValues={selectedGovernanceCategories}
              disabledValues={disabledGovernanceCategories}
              disabledTooltipMessage={disabledTooltipMessage}
              onToggle={(val) => {
                void setSelectedGovernanceCategories(
                  toggleArrayItem(val, selectedGovernanceCategories),
                );
                void setCurrentPage(1);
              }}
              emptyMessage={t('noGovernanceCategories')}
              listClassName={FILTER_LIST_BOX_CLASS}
              renderLabel={(code) => getGovernanceCategoryLabel(code, t) ?? code}
            />
          </div>

          <div className="flex flex-col min-h-0">
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
              listClassName={FILTER_LIST_BOX_CLASS}
              renderLabel={(sectorId) =>
                tSectors.has(`${sectorId}.label`) ? tSectors(`${sectorId}.label`) : sectorId
              }
            />
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
