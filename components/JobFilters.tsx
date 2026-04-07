'use client';

import { Leaf1Outlined, Leaf1Solid } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { useTranslations } from 'next-intl';
import type { PostedWithinSelection } from '@/lib/bulletin/job-query';
import type { WorkType } from '@/lib/work-types';
import Collapsible from './Collapsible';
import FilterIcon from './FilterIcon';
import JobSearch from './JobSearch';
import StyledLink from './StyledLink';
import BooleanFilterRow from './job-filters/BooleanFilterRow';
import CheckboxFilterSection from './job-filters/CheckboxFilterSection';
import FilterButtonGroup from './job-filters/FilterButtonGroup';
import MunicipalityFilterSection from './job-filters/MunicipalityFilterSection';
import type { JobFiltersProps } from './job-filters/types';
import { useJobFiltersModel } from './job-filters/useJobFiltersModel';
import { useBulletinFilterContext } from '@/contexts/BulletinFilterContext';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

export default function JobFilters(props: JobFiltersProps) {
  const controls = useBulletinFilterContext();
  const {
    searchQuery,
    setSearchQuery: onSearchChange,
    selectedOrganizations,
    selectedProvinces,
    selectedMunicipalities,
    selectedEmploymentTypes,
    selectedSources,
    selectedWorkTypes,
    showOnlySse,
    setShowOnlySse: onShowOnlySseChange,
    showJobsWithoutSalary,
    setShowJobsWithoutSalary: onShowJobsWithoutSalaryChange,
    postedWithin,
    setPostedWithin: onPostedWithinChange,
    filtersExpanded,
    setFiltersExpanded: onFiltersExpandedChange,
    isUsingProfileWorkTypes = false,
    handleResetToProfileWorkTypes: onResetToProfileWorkTypes,
    profileMunicipality,
    isUsingProfileLocation = false,
    handleResetToProfileLocation: onResetToProfileLocation,
  } = controls;
  const t = useTranslations();
  const model = useJobFiltersModel(props);

  return (
    <div className="bg-card border border-border rounded-wev-card mb-4 overflow-hidden">
      <JobSearch
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        filtersExpanded={filtersExpanded}
        onFiltersExpandedChange={onFiltersExpandedChange}
        activeFilterChips={model.activeFilterChips}
        filteredJobsCount={model.filteredJobsCountResolved}
        totalJobsCount={model.totalJobsCountResolved}
        hasAnyFilters={model.hasAnyFilters}
        isSuggestedDefaults={model.isSuggestedDefaults}
        onClearAllFilters={model.clearAllFilters}
        onApplySuggestedDefaults={model.applySuggestedDefaults}
      />

      <Collapsible isOpen={filtersExpanded} className="p-6">
        <BooleanFilterRow
          checked={showOnlySse}
          onCheckedChange={onShowOnlySseChange}
          testId={JOB_BOARD_TEST_IDS.sseToggle}
          label={t('filters.sse.label')}
          icon={
            <Lineicons
              icon={showOnlySse ? Leaf1Solid : Leaf1Outlined}
              size={16}
              className="shrink-0 text-primary"
              aria-hidden
            />
          }
          description={
            <>
              {t('filters.sse.description')}
              <a
                href="https://solidarityeconomyprinciples.org/wp-content/uploads/2023/02/SE-Principles-2-pager-handout.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-wev-brand-accent hover:text-wev-primary-text hover:underline"
              >
                {t('filters.sse.learnMore')}
              </a>
            </>
          }
        />

        <BooleanFilterRow
          checked={showJobsWithoutSalary}
          onCheckedChange={onShowJobsWithoutSalaryChange}
          testId={JOB_BOARD_TEST_IDS.salaryToggle}
          label={t('filters.salary.label')}
          description={t('filters.salary.description')}
        />

        <FilterButtonGroup
          testId={JOB_BOARD_TEST_IDS.postedWithinGroup}
          label={t('filters.postedWithin.label')}
          options={model.postedWithinOptions}
          isSelected={(value) => postedWithin === value}
          onSelect={(value) => onPostedWithinChange(value as PostedWithinSelection)}
        />

        <FilterButtonGroup
          testId={JOB_BOARD_TEST_IDS.workTypeGroup}
          label={t('filters.workType.label')}
          options={model.workTypeOptions}
          isSelected={(value) => selectedWorkTypes.includes(value)}
          onSelect={(value) => model.handleWorkTypeToggle(value as WorkType)}
          helper={
            model.hasProfileWorkTypes ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {isUsingProfileWorkTypes
                    ? t('filters.workType.profileDefault', {
                      types: model.profileWorkTypeLabel,
                    })
                    : t('filters.workType.profileOverride', {
                      types: model.profileWorkTypeLabel,
                    })}
                </span>
                <StyledLink href="/profile" variant="text" size="sm" className="p-0">
                  {t('filters.workType.profileLink')}
                </StyledLink>
                {!isUsingProfileWorkTypes && onResetToProfileWorkTypes ? (
                  <button
                    type="button"
                    onClick={onResetToProfileWorkTypes}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {t('filters.workType.profileReset')}
                  </button>
                ) : null}
              </div>
            ) : null
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_auto_auto] md:items-start gap-x-4 gap-y-4 mb-2">
          <CheckboxFilterSection
            testId={JOB_BOARD_TEST_IDS.provinceSection}
            className="flex flex-col order-1 md:row-start-1 md:col-start-1 min-h-0"
            label={t('filters.province.label')}
            selectedCount={selectedProvinces.length}
            totalCount={model.provinces.length}
            options={model.provinces}
            selectedValues={selectedProvinces}
            onToggle={model.handleProvinceToggle}
            emptyMessage={t('filters.province.noData')}
            isIndeterminate={(province) => model.indeterminateProvinces.has(province)}
          />

          <CheckboxFilterSection
            testId={JOB_BOARD_TEST_IDS.employmentTypeSection}
            className="flex flex-col order-3 md:row-start-1 md:col-start-2 min-h-0"
            label={t('filters.employmentType.label')}
            selectedCount={selectedEmploymentTypes.length}
            totalCount={model.employmentTypes.length}
            options={model.employmentTypes}
            selectedValues={selectedEmploymentTypes}
            onToggle={model.handleEmploymentTypeToggle}
            emptyMessage={t('filters.employmentType.noData')}
          />

          <div className="flex flex-col order-2 md:row-start-2 md:col-start-1 gap-1">
            <MunicipalityFilterSection
              testId={JOB_BOARD_TEST_IDS.municipalitySection}
              label={t('filters.municipality.label')}
              selectedMunicipalities={selectedMunicipalities}
              totalMunicipalities={model.allMunicipalities.length}
              selectedProvinces={selectedProvinces}
              visibleMunicipalitiesByProvince={model.visibleMunicipalitiesByProvince}
              onToggleMunicipality={model.handleMunicipalityToggle}
              noDataMessage={t('filters.municipality.noData')}
              selectProvinceMessage={t('filters.municipality.selectProvince')}
              showingFromSelectedMessage={t('filters.municipality.showingFromSelected')}
            />
            {profileMunicipality && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {isUsingProfileLocation
                    ? t('filters.municipality.profileDefault', { city: profileMunicipality })
                    : t('filters.municipality.profileOverride', { city: profileMunicipality })}
                </span>
                <StyledLink href="/profile" variant="text" size="sm" className="p-0">
                  {t('filters.municipality.profileLink')}
                </StyledLink>
                {!isUsingProfileLocation && onResetToProfileLocation && (
                  <button
                    type="button"
                    onClick={onResetToProfileLocation}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {t('filters.municipality.profileReset')}
                  </button>
                )}
              </div>
            )}
          </div>
          <CheckboxFilterSection
            testId={JOB_BOARD_TEST_IDS.organizationSection}
            className="flex flex-col order-4 md:row-start-2 md:col-start-2"
            label={t('filters.organization.label')}
            selectedCount={selectedOrganizations.length}
            totalCount={model.organizations.length}
            options={model.organizations}
            selectedValues={selectedOrganizations}
            onToggle={model.handleOrganizationToggle}
            emptyMessage={t('filters.organization.noData')}
            listClassName="h-48 overflow-y-auto border border-border rounded-wev-btn p-2 bg-background"
          />

          <CheckboxFilterSection
            testId={JOB_BOARD_TEST_IDS.sourceSection}
            className="flex flex-col order-5 md:row-start-3 md:col-start-1"
            label={t('filters.source.label')}
            selectedCount={selectedSources.length}
            totalCount={model.sources.length}
            options={model.sources}
            selectedValues={selectedSources}
            onToggle={model.handleSourceToggle}
            emptyMessage={t('filters.source.noData')}
          />
        </div>

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
