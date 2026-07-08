'use client';

import { useTranslations } from 'next-intl';
import { Leaf1Outlined, Leaf1Solid } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import Collapsible from './Collapsible';
import BooleanFilterRow from './job-filters/BooleanFilterRow';
import CheckboxFilterSection from './job-filters/CheckboxFilterSection';
import MunicipalityFilterSection from './job-filters/MunicipalityFilterSection';
import OrganizationSearch from './OrganizationSearch';
import {
  buildOrgActiveFilterChips,
  toggleArrayItem,
} from './job-filters/build-org-active-filter-chips';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import type { OrganizationFilterControls } from '@/lib/hooks/useOrganizationFilters';
import type { OrganizationFilterOptions } from '@/lib/organizations/server-data';

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
    hasAnyFilters,
    isSuggestedDefaults,
    clearAllFilters,
    applySuggestedDefaults,
  } = controls;

  const activeFilterChips = buildOrgActiveFilterChips({
    filters,
    onRemoveNonSse: () => setShowNonSse(false),
    onRemoveSearch: () => setSearchQuery(''),
    onRemoveProvince: (p) => setSelectedProvinces(toggleArrayItem(p, selectedProvinces)),
    onRemoveMunicipality: (m) =>
      setSelectedMunicipalities(toggleArrayItem(m, selectedMunicipalities)),
    onRemoveType: (type) => setSelectedTypes(toggleArrayItem(type, selectedTypes)),
    tOrgs: t,
    tFilters: tJobs,
  });

  const totalMunicipalities = Object.values(filterOptions.municipalitiesByProvince).reduce(
    (acc, curr) => acc + curr.length,
    0,
  );

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
        <div className="mb-4">
          <BooleanFilterRow
            checked={showNonSse}
            onCheckedChange={(val) => setShowNonSse(val)}
            label={t('showNonSse')}
            icon={
              <Lineicons
                icon={showNonSse ? Leaf1Solid : Leaf1Outlined}
                size={16}
                className="shrink-0 text-primary"
                aria-hidden
              />
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_auto_auto] md:items-start gap-x-4 gap-y-4 mb-2">
          <div className="flex flex-col order-1 md:row-start-1 md:col-start-1 min-h-0">
            <CheckboxFilterSection
              label={tJobs('province.label')}
              selectedCount={selectedProvinces.length}
              totalCount={filterOptions.provinces.length}
              options={filterOptions.provinces}
              selectedValues={selectedProvinces}
              onToggle={(val) =>
                setSelectedProvinces(toggleArrayItem(val, selectedProvinces))
              }
              emptyMessage={tJobs('province.noData')}
            />
          </div>

          <div className="flex flex-col order-2 md:row-start-2 md:col-start-1 min-h-0">
            <MunicipalityFilterSection
              label={tJobs('municipality.label')}
              selectedMunicipalities={selectedMunicipalities}
              totalMunicipalities={totalMunicipalities}
              selectedProvinces={selectedProvinces}
              municipalitiesByProvince={filterOptions.municipalitiesByProvince}
              onToggleMunicipality={(val) =>
                setSelectedMunicipalities(toggleArrayItem(val, selectedMunicipalities))
              }
              noDataMessage={tJobs('municipality.noData')}
              selectProvinceMessage={tJobs('municipality.selectProvince')}
              showingFromSelectedMessage={tJobs('municipality.showingFromSelected')}
            />
          </div>

          <div className="flex flex-col order-3 md:row-start-1 md:col-start-2 md:row-span-2 min-h-0">
            <CheckboxFilterSection
              label={t('organizationType')}
              selectedCount={selectedTypes.length}
              totalCount={filterOptions.types.length}
              options={filterOptions.types}
              selectedValues={selectedTypes}
              onToggle={(val) => setSelectedTypes(toggleArrayItem(val, selectedTypes))}
              emptyMessage={t('noOrganizationTypes')}
              renderLabel={(type) => getOrganizationTypeLabel(type, t)}
            />
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
