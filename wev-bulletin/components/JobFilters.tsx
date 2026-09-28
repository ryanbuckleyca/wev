'use client';

import { Leaf1Outlined, Leaf1Solid } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { useTranslations } from 'next-intl';
import type { PostedWithinSelection } from '@/lib/bulletin/job-query';
import type { WorkType } from '@/lib/work-types';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import Collapsible from './Collapsible';
import FilterIcon from './FilterIcon';
import JobSearch from './JobSearch';
import StyledLink from './StyledLink';
import BooleanFilterRow from './job-filters/BooleanFilterRow';
import CheckboxFilterSection from './job-filters/CheckboxFilterSection';
import {
  FILTER_LIST_BOX_CLASS,
  FILTER_LIST_BOX_COMPACT_CLASS,
} from './job-filters/filter-list-box';
import MunicipalityFilterSection from './job-filters/MunicipalityFilterSection';
import RadioFilterSection from './job-filters/RadioFilterSection';
import type { JobFiltersProps } from './job-filters/types';
import { useJobFiltersModel } from './job-filters/useJobFiltersModel';
import { useBulletinFilterContext } from '@/contexts/BulletinFilterContext';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

export default function JobFilters(props: JobFiltersProps) {
  const controls = useBulletinFilterContext();
  const {
    searchQuery,
    setSearchQuery: onSearchChange,
    selectedOrgTypes,
    selectedSectors,
    selectedProvinces,
    selectedMunicipalities,
    selectedEmploymentTypes,
    selectedSources,
    selectedWorkTypes,
    selectedLanguages,
    showNonSse,
    setShowNonSse: onShowNonSseChange,
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
    isUsingProfileLanguages = false,
    handleResetToProfileLanguages: onResetToProfileLanguages,
  } = controls;
  const t = useTranslations();
  const tOrgs = useTranslations('organizations');
  const tSectors = useTranslations('taxonomy.sectors');
  const model = useJobFiltersModel(props);
  const isAdmin = props.isAdmin ?? false;

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
        loading={props.loading ?? false}
        hasAnyFilters={model.hasAnyFilters}
        isSuggestedDefaults={model.isSuggestedDefaults}
        onClearAllFilters={model.clearAllFilters}
        onApplySuggestedDefaults={model.applySuggestedDefaults}
      />

      <Collapsible id="job-filters-content" isOpen={filtersExpanded} className="p-6">
        <div className="flex flex-col gap-6">
          {isAdmin && (
            <div data-testid={JOB_BOARD_TEST_IDS.sseToggle}>
              <BooleanFilterRow
                checked={showNonSse}
                onCheckedChange={onShowNonSseChange}
                label={t('filters.showNonSse')}
                icon={
                  <Lineicons
                    icon={showNonSse ? Leaf1Solid : Leaf1Outlined}
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
            </div>
          )}

          <div data-testid={JOB_BOARD_TEST_IDS.salaryToggle}>
            <BooleanFilterRow
              checked={showJobsWithoutSalary}
              onCheckedChange={onShowJobsWithoutSalaryChange}
              label={t('filters.salary.label')}
              description={t('filters.salary.description')}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_auto_auto] md:items-start gap-x-4 gap-y-4 mb-2">
            <div
              className="flex flex-col min-h-0"
              data-testid={JOB_BOARD_TEST_IDS.postedWithinGroup}
            >
              <RadioFilterSection
                label={t('filters.postedWithin.label')}
                name="job-posted-within"
                options={model.postedWithinOptions}
                selectedValue={postedWithin}
                onSelect={(value) => onPostedWithinChange(value as PostedWithinSelection)}
                listClassName={FILTER_LIST_BOX_COMPACT_CLASS}
              />
            </div>

            <div
              className="flex flex-col min-h-0 gap-1"
              data-testid={JOB_BOARD_TEST_IDS.workTypeGroup}
            >
              <CheckboxFilterSection
                label={t('filters.workType.label')}
                selectedCount={selectedWorkTypes.length}
                totalCount={model.workTypeOptions.length}
                options={model.workTypeOptions.map((option) => option.value)}
                selectedValues={selectedWorkTypes}
                onToggle={(value) => model.handleWorkTypeToggle(value as WorkType)}
                emptyMessage={t('filters.workType.label')}
                listClassName={FILTER_LIST_BOX_COMPACT_CLASS}
                renderLabel={(value) =>
                  model.workTypeOptions.find((option) => option.value === value)?.label ?? value
                }
              />
              {model.hasProfileWorkTypes ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="helper-text">
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
              ) : null}
            </div>

            <div className="flex flex-col min-h-0" data-testid={JOB_BOARD_TEST_IDS.provinceSection}>
              <CheckboxFilterSection
                label={t('filters.province.label')}
                selectedCount={selectedProvinces.length}
                totalCount={model.provinces.length}
                options={model.provinces}
                selectedValues={selectedProvinces}
                onToggle={model.handleProvinceToggle}
                emptyMessage={t('filters.province.noData')}
                listClassName={FILTER_LIST_BOX_CLASS}
                isIndeterminate={(province) => model.indeterminateProvinces.has(province)}
              />
            </div>

            <div
              className="flex flex-col min-h-0 gap-1"
              data-testid={JOB_BOARD_TEST_IDS.municipalitySection}
            >
              <MunicipalityFilterSection
                label={t('filters.municipality.label')}
                selectedMunicipalities={selectedMunicipalities}
                totalMunicipalities={model.allMunicipalities.length}
                selectedProvinces={selectedProvinces}
                municipalitiesByProvince={model.municipalitiesByProvince}
                onToggleMunicipality={model.handleMunicipalityToggle}
                listClassName={FILTER_LIST_BOX_CLASS}
                noDataMessage={t('filters.municipality.noData')}
                selectProvinceMessage={t('filters.municipality.selectProvince')}
                showingFromSelectedMessage={t('filters.municipality.showingFromSelected')}
              />
              {profileMunicipality && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-muted-foreground">
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

            <div
              className="flex flex-col min-h-0"
              data-testid={JOB_BOARD_TEST_IDS.organizationTypeSection}
            >
              <CheckboxFilterSection
                label={tOrgs('organizationType')}
                selectedCount={selectedOrgTypes.length}
                totalCount={model.orgTypes.length}
                options={model.orgTypes}
                selectedValues={selectedOrgTypes}
                onToggle={model.handleOrgTypeToggle}
                emptyMessage={tOrgs('noOrganizationTypes')}
                listClassName={FILTER_LIST_BOX_CLASS}
                renderLabel={(type) => getOrganizationTypeLabel(type, tOrgs) ?? type}
              />
            </div>

            <div className="flex flex-col min-h-0" data-testid={JOB_BOARD_TEST_IDS.sectorSection}>
              <CheckboxFilterSection
                label={tOrgs('sector')}
                selectedCount={selectedSectors.length}
                totalCount={model.sectors.length}
                options={model.sectors}
                selectedValues={selectedSectors}
                onToggle={model.handleSectorToggle}
                emptyMessage={tOrgs('noOrganizationSectors')}
                listClassName={FILTER_LIST_BOX_CLASS}
                renderLabel={(sectorId) =>
                  tSectors.has(`${sectorId}.label`) ? tSectors(`${sectorId}.label`) : sectorId
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 md:items-start gap-x-4 gap-y-4">
            <div
              className="flex flex-col min-h-0 gap-1"
              data-testid={JOB_BOARD_TEST_IDS.languageGroup}
            >
              <CheckboxFilterSection
                label={t('filters.language.label')}
                selectedCount={selectedLanguages.length}
                totalCount={model.languageOptions.length}
                options={model.languageOptions.map((option) => option.value)}
                selectedValues={selectedLanguages}
                onToggle={model.handleLanguageToggle}
                emptyMessage={t('filters.language.noData')}
                listClassName={FILTER_LIST_BOX_CLASS}
                renderLabel={(value) =>
                  model.languageOptions.find((option) => option.value === value)?.label ?? value
                }
              />
              {model.hasProfileLanguages ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="helper-text">
                    {isUsingProfileLanguages
                      ? t('filters.language.profileDefault', {
                          languages: model.profileLanguageLabel,
                        })
                      : t('filters.language.profileOverride', {
                          languages: model.profileLanguageLabel,
                        })}
                  </span>
                  <StyledLink href="/profile" variant="text" size="sm" className="p-0">
                    {t('filters.language.profileLink')}
                  </StyledLink>
                  {!isUsingProfileLanguages && onResetToProfileLanguages ? (
                    <button
                      type="button"
                      onClick={onResetToProfileLanguages}
                      className="text-[var(--primary)] hover:underline"
                    >
                      {t('filters.language.profileReset')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              className="flex flex-col min-h-0"
              data-testid={JOB_BOARD_TEST_IDS.employmentTypeSection}
            >
              <CheckboxFilterSection
                label={t('filters.employmentType.label')}
                selectedCount={selectedEmploymentTypes.length}
                totalCount={model.employmentTypes.length}
                options={model.employmentTypes}
                selectedValues={selectedEmploymentTypes}
                onToggle={model.handleEmploymentTypeToggle}
                emptyMessage={t('filters.employmentType.noData')}
                listClassName={FILTER_LIST_BOX_CLASS}
              />
            </div>

            <div className="flex flex-col min-h-0" data-testid={JOB_BOARD_TEST_IDS.sourceSection}>
              <CheckboxFilterSection
                label={t('filters.source.label')}
                selectedCount={selectedSources.length}
                totalCount={model.sources.length}
                options={model.sources}
                selectedValues={selectedSources}
                onToggle={model.handleSourceToggle}
                emptyMessage={t('filters.source.noData')}
                listClassName={FILTER_LIST_BOX_CLASS}
              />
            </div>
          </div>
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
