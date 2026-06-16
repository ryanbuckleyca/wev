'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import JobFilters from '@/components/JobFilters';
import JobListings from '@/components/JobListings';
import SortDropdown from '@/components/SortDropdown';
import ExpandAllToggle from '@/components/ExpandAllToggle';
import WatercolorBackground from '@/components/WatercolorBackground';
import CopyPageJobsButton from '@/components/CopyPageJobsButton';
import Pagination from '@/components/Pagination';
import { SITE_CONFIG } from '@/lib/site-config';
import type { BulletinDataState } from '@/lib/bulletin/types';
import type { BulletinFilterControls } from '@/lib/hooks/useBulletinFilters';
import type { Profile } from '@/lib/supabase/profiles';
import { BulletinFilterProvider } from '@/contexts/BulletinFilterContext';

interface BulletinPageViewProps {
  isAdmin: boolean;
  isLoggedIn: boolean;
  userId: string | null;
  profile: Profile | null;
  filters: BulletinFilterControls;
  data: BulletinDataState;
}

export default function BulletinPageView({
  isAdmin,
  isLoggedIn,
  userId,
  profile,
  filters,
  data,
}: BulletinPageViewProps) {
  const t = useTranslations();

  return (
    <BulletinFilterProvider filters={filters}>
      <main
        className="min-h-screen pb-8 relative"
        style={{
          background: 'var(--background)',
        }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <WatercolorBackground />
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10">
          <header className="mb-8">
            <Image
              src={SITE_CONFIG.logotypeUrl}
              alt={t('home.heading')}
              width={100}
              height={40}
              unoptimized
              className="main-logo wev-logotype w-[100px] h-auto mb-2"
              priority
            />
            <h1 className="text-xl font-medium text-primary">{t('home.heading')}</h1>
          </header>

          {isAdmin && (
            <div className="flex flex-col justify-start items-stretch gap-4 mb-6">
              <div className="flex flex-row gap-4 max-[442px]:flex-col max-[442px]:items-stretch">
                <div className="max-[442px]:w-full [&_button]:max-[442px]:w-full">
                  <CopyPageJobsButton jobs={data.jobsOnPage} />
                </div>
              </div>
            </div>
          )}

          <JobFilters
            jobs={data.jobsOnPage}
            filterOptions={data.filterOptions}
            filteredJobsCount={data.totalMatchingJobs}
            totalJobsCount={data.availableJobsCount}
            loading={data.loading}
          />

          {data.jobsOnPage.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pl-2 pr-1 py-1 mb-4 items-center justify-center sm:justify-start p-1 px-0.5">
              <div className="text-sm text-center sm:text-left text-xs text-muted-foreground">
                <span className="font-semibold text-wev-brand-accent">
                  {t('home.lastUpdated')}{' '}
                </span>
                <span>{data.lastScrapeTime || t('home.unknown')}</span>
              </div>

              <div className="flex items-center gap-2 mt-2 sm:mt-0 sm:justify-end">
                <SortDropdown showMatchOption={isLoggedIn} />

                <div className="w-0.5 h-3.5 bg-border" />

                <ExpandAllToggle />
              </div>
            </div>
          )}

          <JobListings
            jobs={data.jobsOnPage}
            totalJobsCount={data.availableJobsCount}
            loading={data.loading}
            userMetaLoading={data.userMetaLoading}
            error={data.error}
            isAdmin={isAdmin}
            userId={userId}
            profile={profile}
            matchData={data.matchData}
            bookmarkedJobIds={data.bookmarkedJobIds}
            onJobSseChange={data.handleJobSseChange}
            onJobBookmarkChange={data.handleJobBookmarkChange}
            skillLabels={data.skillLabels}
          />

          <Pagination
            totalPages={data.totalPages}
            totalItems={data.totalMatchingJobs}
            itemsPerPage={data.itemsPerPage}
          />
        </div>
      </main>
    </BulletinFilterProvider>
  );
}
