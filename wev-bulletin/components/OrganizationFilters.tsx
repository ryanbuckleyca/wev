'use client';

import { useTranslations } from 'next-intl';
import { Leaf1Outlined, Leaf1Solid } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import Collapsible from './Collapsible';
import BooleanFilterRow from './job-filters/BooleanFilterRow';
import CheckboxFilterSection from './job-filters/CheckboxFilterSection';
import MunicipalityFilterSection from './job-filters/MunicipalityFilterSection';
import OrganizationSearch from './OrganizationSearch';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import type { OrganizationFilterControls } from '@/lib/hooks/useOrganizationFilters';
import type { OrganizationFilterOptions } from '@/lib/organizations/server-data';
import type { ActiveFilterChip } from './JobSearch';

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
  const tJobs = useTranslations('filters');

  const {
    filters,
    searchQuery,
    setSearchQuery,
    showOnlySse,
    setShowOnlySse,
    selectedProvinces,
    setSelectedProvinces,
    selectedMunicipalities,
    setSelectedMunicipalities,
    selectedTypes,
    setSelectedTypes,
    hasAnyFilters,
    clearAllFilters,
  } = controls;

  const toggleArrayItem = (item: string, current: string[], setter: (val: string[]) => void) => {
    if (current.includes(item)) {
      setter(current.filter((i) => i !== item));
    } else {
      setter([...current, item]);
    }
  };

  const activeFilterChips: ActiveFilterChip[] = [
    ...(filters.showOnlySse
      ? [
          {
            id: 'sse',
            label: tJobs('chips.sseShort'),
            title: tJobs('chips.sseOnly'),
            onRemove: () => setShowOnlySse(false),
          },
        ]
      : []),
    ...(filters.searchQuery
      ? [{ id: 'q', label: `"${filters.searchQuery}"`, onRemove: () => setSearchQuery('') }]
      : []),
    ...filters.selectedProvinces.map((p) => ({
      id: `p-${p}`,
      label: p,
      onRemove: () => toggleArrayItem(p, selectedProvinces, setSelectedProvinces),
    })),
    ...filters.selectedMunicipalities.map((m) => ({
      id: `m-${m}`,
      label: m,
      onRemove: () => toggleArrayItem(m, selectedMunicipalities, setSelectedMunicipalities),
    })),
    ...filters.selectedTypes.map((type) => ({
      id: `type-${type}`,
      label: getOrganizationTypeLabel(type, t) ?? type,
      onRemove: () => toggleArrayItem(type, selectedTypes, setSelectedTypes),
    })),
  ];

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
        onClearAllFilters={clearAllFilters}
      />

      <Collapsible id="org-filters-content" isOpen={filtersExpanded} className="p-6">
        <div className="mb-4">
          <BooleanFilterRow
            checked={showOnlySse}
            onCheckedChange={(val) => setShowOnlySse(val)}
            label={t('showOnlySse')}
            icon={
              <Lineicons
                icon={showOnlySse ? Leaf1Solid : Leaf1Outlined}
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
              onToggle={(val) => toggleArrayItem(val, selectedProvinces, setSelectedProvinces)}
              emptyMessage={tJobs('province.noData')}
            />
          </div>

          <div className="flex flex-col order-2 md:row-start-2 md:col-start-1 min-h-0">
            <MunicipalityFilterSection
              label={tJobs('municipality.label')}
              selectedMunicipalities={selectedMunicipalities}
              totalMunicipalities={Object.values(filterOptions.municipalitiesByProvince).reduce(
                (acc, curr) => acc + curr.length,
                0,
              )}
              selectedProvinces={selectedProvinces}
              municipalitiesByProvince={filterOptions.municipalitiesByProvince}
              onToggleMunicipality={(val) =>
                toggleArrayItem(val, selectedMunicipalities, setSelectedMunicipalities)
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
              onToggle={(val) => toggleArrayItem(val, selectedTypes, setSelectedTypes)}
              emptyMessage={t('noOrganizationTypes')}
              renderLabel={(type) => getOrganizationTypeLabel(type, t)}
            />
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
