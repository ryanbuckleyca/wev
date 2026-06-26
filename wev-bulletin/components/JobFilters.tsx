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
import { useProfile } from '@/contexts/ProfileContext';
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
    selectedLanguages,
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
    isUsingProfileLanguages = false,
    handleResetToProfileLanguages: onResetToProfileLanguages,
    distanceKm,
    setDistanceKm: onDistanceKmChange,
    userLat,
    setUserLat,
    userLng,
    setUserLng,
  } = controls;
  const { profile } = useProfile();
  const profileLat = profile?.lat ?? null;
  const profileLng = profile?.lng ?? null;
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
        loading={props.loading ?? false}
        hasAnyFilters={model.hasAnyFilters}
        isSuggestedDefaults={model.isSuggestedDefaults}
        onClearAllFilters={model.clearAllFilters}
        onApplySuggestedDefaults={model.applySuggestedDefaults}
      />

      <Collapsible id="job-filters-content" isOpen={filtersExpanded} className="p-6">
        <div data-testid={JOB_BOARD_TEST_IDS.sseToggle}>
          <BooleanFilterRow
            checked={showOnlySse}
            onCheckedChange={onShowOnlySseChange}
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
        </div>

        <div data-testid={JOB_BOARD_TEST_IDS.salaryToggle}>
          <BooleanFilterRow
            checked={showJobsWithoutSalary}
            onCheckedChange={onShowJobsWithoutSalaryChange}
            label={t('filters.salary.label')}
            description={t('filters.salary.description')}
          />
        </div>

        <div data-testid={JOB_BOARD_TEST_IDS.postedWithinGroup}>
          <FilterButtonGroup
            label={t('filters.postedWithin.label')}
            options={model.postedWithinOptions}
            isSelected={(value) => postedWithin === value}
            onSelect={(value) => onPostedWithinChange(value as PostedWithinSelection)}
          />
        </div>

        <div data-testid="distance-filter-group">
          <FilterButtonGroup
            label={t('filters.distance.label')}
            options={model.distanceOptions}
            isSelected={(value) => (value === 'any' && distanceKm == null) || (distanceKm != null && value === String(distanceKm))}
            onSelect={(value) => {
              if (value === 'any') {
                onDistanceKmChange(null);
                setUserLat(null);
                setUserLng(null);
              } else {
                // If profile location is available, use it.
                if (profileLat != null && profileLng != null) {
                  onDistanceKmChange(Number(value));
                  setUserLat(profileLat);
                  setUserLng(profileLng);
                } else if ('geolocation' in navigator) {
                  // Fallback to browser location
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      onDistanceKmChange(Number(value));
                      setUserLat(position.coords.latitude);
                      setUserLng(position.coords.longitude);
                    },
                    (error) => {
                      console.error('Error getting location', error);
                      // Fallback failed. Could show toast.
                      onDistanceKmChange(null);
                    }
                  );
                }
              }
            }}
            helper={
              distanceKm != null ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="helper-text">
                    {userLat === profileLat && userLng === profileLng
                      ? t('filters.distance.profileDefault')
                      : t('filters.distance.useBrowserLocation')}
                  </span>
                  {!profileLat && (
                    <StyledLink href="/profile" variant="text" size="sm" className="p-0">
                      {t('filters.distance.fallbackPrompt')}
                    </StyledLink>
                  )}
                </div>
              ) : null
            }
          />
        </div>

        <div data-testid={JOB_BOARD_TEST_IDS.workTypeGroup}>
          <FilterButtonGroup
            label={t('filters.workType.label')}
            options={model.workTypeOptions}
            isSelected={(value) => selectedWorkTypes.includes(value)}
            onSelect={(value) => model.handleWorkTypeToggle(value as WorkType)}
            helper={
              model.hasProfileWorkTypes ? (
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
              ) : null
            }
          />
        </div>

        <div data-testid={JOB_BOARD_TEST_IDS.languageGroup}>
          <FilterButtonGroup
            label={t('filters.language.label')}
            options={model.languageOptions}
            isSelected={(value) => selectedLanguages.includes(value)}
            onSelect={(value) => model.handleLanguageToggle(value)}
            helper={
              model.hasProfileLanguages ? (
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
              ) : null
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_auto_auto] md:items-start gap-x-4 gap-y-4 mb-2">
          <div
            className="flex flex-col order-1 md:row-start-1 md:col-start-1 min-h-0"
            data-testid={JOB_BOARD_TEST_IDS.provinceSection}
          >
            <CheckboxFilterSection
              label={t('filters.province.label')}
              selectedCount={selectedProvinces.length}
              totalCount={model.provinces.length}
              options={model.provinces}
              selectedValues={selectedProvinces}
              onToggle={model.handleProvinceToggle}
              emptyMessage={t('filters.province.noData')}
              isIndeterminate={(province) => model.indeterminateProvinces.has(province)}
            />
          </div>

          <div
            className="flex flex-col order-3 md:row-start-1 md:col-start-2 min-h-0"
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
            />
          </div>

          <div
            className="flex flex-col order-2 md:row-start-2 md:col-start-1 gap-1"
            data-testid={JOB_BOARD_TEST_IDS.municipalitySection}
          >
            <MunicipalityFilterSection
              label={t('filters.municipality.label')}
              selectedMunicipalities={selectedMunicipalities}
              totalMunicipalities={model.allMunicipalities.length}
              selectedProvinces={selectedProvinces}
              municipalitiesByProvince={model.municipalitiesByProvince}
              onToggleMunicipality={model.handleMunicipalityToggle}
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
            className="flex flex-col order-4 md:row-start-2 md:col-start-2"
            data-testid={JOB_BOARD_TEST_IDS.organizationSection}
          >
            <CheckboxFilterSection
              label={t('filters.organization.label')}
              selectedCount={selectedOrganizations.length}
              totalCount={model.organizations.length}
              options={model.organizations}
              selectedValues={selectedOrganizations}
              onToggle={model.handleOrganizationToggle}
              emptyMessage={t('filters.organization.noData')}
              listClassName="h-48 overflow-y-auto border border-border rounded-wev-btn p-2 bg-background"
            />
          </div>

          <div
            className="flex flex-col order-5 md:row-start-3 md:col-start-1"
            data-testid={JOB_BOARD_TEST_IDS.sourceSection}
          >
            <CheckboxFilterSection
              label={t('filters.source.label')}
              selectedCount={selectedSources.length}
              totalCount={model.sources.length}
              options={model.sources}
              selectedValues={selectedSources}
              onToggle={model.handleSourceToggle}
              emptyMessage={t('filters.source.noData')}
            />
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
