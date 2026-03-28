'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import JobFilters from '@/components/JobFilters';
import JobListings from '@/components/JobListings';
import SortDropdown from '@/components/SortDropdown';
import ExpandAllToggle from '@/components/ExpandAllToggle';
import WatercolorBackground from '@/components/WatercolorBackground';
import ReScrapeButton from '@/components/ReScrapeButton';
import CopyAllJobsButton from '@/components/CopyAllJobsButton';
import Pagination from '@/components/Pagination';
import type { BulletinDataState } from '@/lib/hooks/useBulletinData';
import type { BulletinFilterControls } from '@/lib/hooks/useBulletinFilters';

const HOME_LOGOTYPE_URL =
  'https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png';

interface BulletinPageViewProps {
  isAdmin: boolean;
  isLoggedIn: boolean;
  filters: BulletinFilterControls;
  data: BulletinDataState;
}

export default function BulletinPageView({
  isAdmin,
  isLoggedIn,
  filters,
  data,
}: BulletinPageViewProps) {
  const t = useTranslations();

  return (
    <main
      className="min-h-screen pb-8 relative overflow-hidden"
      style={{
        background: 'var(--background)',
      }}
    >
      <WatercolorBackground />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10">
        <header className="mb-8">
          <Image
            src={HOME_LOGOTYPE_URL}
            alt="wev"
            width={100}
            height={40}
            className="main-logo wev-logotype w-[100px] h-auto mb-2"
            priority
          />
          <p className="text-xl font-medium text-primary">{t('home.heading')}</p>
        </header>

        {isAdmin && (
          <div className="flex flex-col justify-start items-stretch gap-4 mb-6">
            <div className="flex flex-row gap-4 max-[442px]:flex-col max-[442px]:items-stretch">
              <div className="max-[442px]:w-full [&_button]:max-[442px]:w-full">
                <ReScrapeButton onComplete={data.refresh} />
              </div>
              <div className="max-[442px]:w-full [&_button]:max-[442px]:w-full">
                <CopyAllJobsButton jobs={data.filteredJobs} />
              </div>
            </div>
          </div>
        )}

        <JobFilters
          jobs={data.allJobs}
          filteredJobsCount={data.filteredJobs.length}
          totalJobsCount={data.allJobs.length}
          searchQuery={filters.searchQuery}
          onSearchChange={filters.setSearchQuery}
          selectedOrganizations={filters.selectedOrganizations}
          onOrganizationsChange={filters.setSelectedOrganizations}
          selectedProvinces={filters.selectedProvinces}
          onProvincesChange={filters.setSelectedProvinces}
          selectedMunicipalities={filters.selectedMunicipalities}
          onMunicipalitiesChange={filters.setSelectedMunicipalities}
          selectedEmploymentTypes={filters.selectedEmploymentTypes}
          onEmploymentTypesChange={filters.setSelectedEmploymentTypes}
          selectedSources={filters.selectedSources}
          onSourcesChange={filters.setSelectedSources}
          selectedWorkTypes={filters.selectedWorkTypes}
          onWorkTypesChange={filters.setSelectedWorkTypes}
          showOnlySse={filters.showOnlySse}
          onShowOnlySseChange={filters.setShowOnlySse}
          showJobsWithoutSalary={filters.showJobsWithoutSalary}
          onShowJobsWithoutSalaryChange={filters.setShowJobsWithoutSalary}
          postedWithin={filters.postedWithin}
          onPostedWithinChange={filters.setPostedWithin}
          filtersExpanded={filters.filtersExpanded}
          onFiltersExpandedChange={filters.setFiltersExpanded}
          profileWorkTypes={filters.profileWorkTypes}
          isUsingProfileWorkTypes={filters.isUsingProfileWorkTypes}
          onResetToProfileWorkTypes={filters.handleResetToProfileWorkTypes}
        />

        {data.allJobs.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pl-2 pr-1 py-1 mb-4 items-center justify-center sm:justify-start p-1 px-0.5">
            <div className="text-sm text-center sm:text-left text-xs text-muted-foreground">
              <span className="font-semibold text-wev-brand-accent">{t('home.lastUpdated')} </span>
              <span>{data.lastScrapeTime || t('home.unknown')}</span>
            </div>

            <div className="flex items-center gap-2 mt-2 sm:mt-0 gap-2 sm:justify-end">
              <SortDropdown
                sortBy={filters.sortBy}
                onChange={filters.setSortBy}
                showMatchOption={isLoggedIn}
              />

              <div className="w-0.5 h-3.5 bg-border" />

              <ExpandAllToggle
                allExpanded={filters.allJobsExpanded}
                onToggle={() => filters.setAllJobsExpanded(!filters.allJobsExpanded)}
              />
            </div>
          </div>
        )}

        <JobListings
          jobs={data.paginatedJobs}
          loading={data.loading}
          error={data.error}
          allExpanded={filters.allJobsExpanded}
          matchData={data.matchData}
          bookmarkedJobIds={data.bookmarkedJobIds}
          selectedWorkTypes={filters.selectedWorkTypes}
          onJobSseChange={data.handleJobSseChange}
          onJobBookmarkChange={data.handleJobBookmarkChange}
        />

        <Pagination
          currentPage={filters.currentPage}
          totalPages={data.totalPages}
          onPageChange={filters.setCurrentPage}
          totalItems={data.filteredJobs.length}
          itemsPerPage={data.itemsPerPage}
        />
      </div>
    </main>
  );
}
