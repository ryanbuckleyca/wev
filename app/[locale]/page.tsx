'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import JobListings from '@/components/JobListings';
import JobFilters from '@/components/JobFilters';
import { useProfile } from '@/lib/hooks/useProfile';
import type { JobPosting, JobMatchData } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import SortDropdown from '@/components/SortDropdown';
import ExpandAllToggle from '@/components/ExpandAllToggle';
import WatercolorBackground from '@/components/WatercolorBackground';
import ReScrapeButton from '@/components/ReScrapeButton';
import CopyAllJobsButton from '@/components/CopyAllJobsButton';
import Pagination from '@/components/Pagination';
import { normalizeWorkTypes } from '@/lib/work-types';
import {
  filterJobs,
  JOB_SORT_OPTIONS,
  POSTED_WITHIN_FILTER_OPTIONS,
  sortJobs,
} from '@/lib/bulletin/job-query';
import { fetchMatchMapForJobs } from '@/lib/bulletin/match-map';
import { fetchBookmarkedJobIds, formatLastScrapeTime } from '@/lib/bulletin/client-data';

const ITEMS_PER_PAGE = 20;

const HOME_LOGOTYPE_URL =
  'https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png';

export default function Home() {
  const t = useTranslations();
  const locale = useLocale();
  const { role, user } = useAuth();
  const { profile, loading: profileLoading } = useProfile(user?.id);
  const searchParams = useSearchParams();
  const [allJobs, setAllJobs] = useState<JobPosting[]>([]);
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state - synced with URL via nuqs
  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [selectedOrganizations, setSelectedOrganizations] = useQueryState(
    'org',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedProvinces, setSelectedProvinces] = useQueryState(
    'province',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedMunicipalities, setSelectedMunicipalities] = useQueryState(
    'municipality',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedEmploymentTypes, setSelectedEmploymentTypes] = useQueryState(
    'employment',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedSources, setSelectedSources] = useQueryState(
    'source',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedWorkTypes, setSelectedWorkTypes] = useQueryState(
    'workType',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [showOnlySse, setShowOnlySse] = useQueryState('sse', parseAsBoolean.withDefault(true));
  const [showJobsWithoutSalary, setShowJobsWithoutSalary] = useQueryState(
    'salary',
    parseAsBoolean.withDefault(true),
  );
  const [postedWithin, setPostedWithin] = useQueryState(
    'posted',
    parseAsStringLiteral(POSTED_WITHIN_FILTER_OPTIONS).withDefault('2-weeks'),
  );
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [allJobsExpanded, setAllJobsExpanded] = useState(true);

  const profileWorkTypes = useMemo(
    () => normalizeWorkTypes(profile?.work_types),
    [profile?.work_types],
  );
  const [hasAppliedProfileWorkTypes, setHasAppliedProfileWorkTypes] = useState(false);
  const isUsingProfileWorkTypes = useMemo(() => {
    if (profileWorkTypes.length === 0) return false;
    if (selectedWorkTypes.length === 0) return false;
    const profileSet = new Set(profileWorkTypes);
    const selectedSet = new Set(selectedWorkTypes);
    if (profileSet.size !== selectedSet.size) return false;
    return Array.from(profileSet).every((wt) => selectedSet.has(wt));
  }, [profileWorkTypes, selectedWorkTypes]);

  useEffect(() => {
    if (!user?.id) return;
    if (hasAppliedProfileWorkTypes) return;
    if (profileLoading) return;
    if (profileWorkTypes.length === 0) {
      setHasAppliedProfileWorkTypes(true);
      return;
    }
    const hasWorkTypeParam = searchParams?.has('workType') ?? false;
    if (hasWorkTypeParam || selectedWorkTypes.length > 0) {
      setHasAppliedProfileWorkTypes(true);
      return;
    }
    setSelectedWorkTypes(profileWorkTypes);
    setHasAppliedProfileWorkTypes(true);
  }, [
    user?.id,
    hasAppliedProfileWorkTypes,
    profileWorkTypes,
    searchParams,
    selectedWorkTypes.length,
    setSelectedWorkTypes,
    profileLoading,
  ]);

  const handleResetToProfileWorkTypes = useCallback(() => {
    if (profileWorkTypes.length === 0) return;
    setSelectedWorkTypes(profileWorkTypes);
  }, [profileWorkTypes, setSelectedWorkTypes]);

  // Sort state
  const [sortBy, setSortBy] = useQueryState(
    'sort',
    parseAsStringLiteral(JOB_SORT_OPTIONS).withDefault('date-desc'),
  );

  // Match data state
  const [matchData, setMatchData] = useState<Map<string, JobMatchData>>(new Map());
  // Bookmarked job IDs (batch-fetched for logged-in users)
  const [bookmarkedJobIds, setBookmarkedJobIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('Data fetching timeout - forcing completion');
      setLoading(false);
      setError(t('home.errors.timeout'));
    }, 10000); // 10 second timeout

    try {
      const res = await fetch(`/api/bulletin?locale=${locale}`);
      clearTimeout(timeoutId);

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? t('home.errors.loadFailed'));
      }
      const { jobs: jobsData, lastScrapeTime: rawScrapeTime } = await res.json();

      setLastScrapeTime(formatLastScrapeTime(rawScrapeTime, locale));

      setAllJobs(jobsData ?? []);
      setCurrentPage(1);
      // Match data and bookmarks are fetched by the useEffect when userId + allJobs are ready
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('Error fetching data:', err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : t('home.errors.loadFailed');
      setError(errorMessage);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [locale, t, setCurrentPage]);

  // Fetch bookmarks for job IDs (only when user is logged in)
  const fetchBookmarks = useCallback(
    async (jobIds: string[]) => {
      if (!user || jobIds.length === 0) return new Set<string>();
      return fetchBookmarkedJobIds(user.id, jobIds);
    },
    [user],
  );

  // Fetch match data for all jobs (only when user is logged in)
  const fetchMatchData = useCallback(
    async (jobs: JobPosting[]) => {
      if (!user) return new Map();
      return fetchMatchMapForJobs(
        user.id,
        jobs.map((job) => job.id),
      );
    },
    [user],
  );

  // Filter and sort jobs based on search, filters, and sort option
  const filteredJobs = useMemo(() => {
    return sortJobs(
      filterJobs(allJobs, {
        searchQuery,
        selectedOrganizations,
        selectedProvinces,
        selectedMunicipalities,
        selectedEmploymentTypes,
        selectedSources,
        selectedWorkTypes,
        showOnlySse,
        showJobsWithoutSalary,
        postedWithin,
      }),
      sortBy,
      matchData,
    );
  }, [
    allJobs,
    searchQuery,
    selectedOrganizations,
    selectedProvinces,
    selectedMunicipalities,
    selectedEmploymentTypes,
    selectedSources,
    selectedWorkTypes,
    showOnlySse,
    showJobsWithoutSalary,
    postedWithin,
    sortBy,
    matchData,
  ]);

  // Paginate filtered jobs
  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredJobs.slice(startIndex, endIndex);
  }, [filteredJobs, currentPage]);

  // Reset to page 1 when filters or sort change (only if not already on page 1)
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [
    currentPage,
    setCurrentPage,
    searchQuery,
    selectedOrganizations,
    selectedProvinces,
    selectedMunicipalities,
    selectedEmploymentTypes,
    selectedSources,
    selectedWorkTypes,
    showOnlySse,
    showJobsWithoutSalary,
    postedWithin,
    sortBy,
  ]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Refetch match data and bookmarks when user changes (by id, not object reference)
  // Using user?.id avoids refetch on token refresh when switching tabs
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId && allJobs.length > 0) {
      Promise.all([fetchMatchData(allJobs), fetchBookmarks(allJobs.map((j) => j.id))]).then(
        ([matches, bookmarked]) => {
          setMatchData(matches);
          setBookmarkedJobIds(bookmarked);
        },
      );
    } else {
      setMatchData(new Map());
      setBookmarkedJobIds(new Set());
    }
  }, [userId, allJobs, fetchBookmarks, fetchMatchData]);

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE);

  return (
    <main
      className="min-h-screen pb-8 relative overflow-hidden"
      style={{
        background: 'var(--background)',
      }}
    >
      <WatercolorBackground />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10">
        {/* Home page hero section */}
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

        {/* Action Buttons - Admin Only */}
        {role === 'admin' && (
          <div className="flex flex-col justify-start items-stretch gap-4 mb-6">
            <div className="flex flex-row gap-4 max-[442px]:flex-col max-[442px]:items-stretch">
              <div className="max-[442px]:w-full [&_button]:max-[442px]:w-full">
                <ReScrapeButton onComplete={fetchData} />
              </div>
              <div className="max-[442px]:w-full [&_button]:max-[442px]:w-full">
                <CopyAllJobsButton jobs={filteredJobs} />
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <JobFilters
          jobs={allJobs}
          filteredJobsCount={filteredJobs.length}
          totalJobsCount={allJobs.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedOrganizations={selectedOrganizations}
          onOrganizationsChange={setSelectedOrganizations}
          selectedProvinces={selectedProvinces}
          onProvincesChange={setSelectedProvinces}
          selectedMunicipalities={selectedMunicipalities}
          onMunicipalitiesChange={setSelectedMunicipalities}
          selectedEmploymentTypes={selectedEmploymentTypes}
          onEmploymentTypesChange={setSelectedEmploymentTypes}
          selectedSources={selectedSources}
          onSourcesChange={setSelectedSources}
          selectedWorkTypes={selectedWorkTypes}
          onWorkTypesChange={setSelectedWorkTypes}
          showOnlySse={showOnlySse}
          onShowOnlySseChange={setShowOnlySse}
          showJobsWithoutSalary={showJobsWithoutSalary}
          onShowJobsWithoutSalaryChange={setShowJobsWithoutSalary}
          postedWithin={postedWithin}
          onPostedWithinChange={setPostedWithin}
          filtersExpanded={filtersExpanded}
          onFiltersExpandedChange={setFiltersExpanded}
          profileWorkTypes={profileWorkTypes}
          isUsingProfileWorkTypes={isUsingProfileWorkTypes}
          onResetToProfileWorkTypes={handleResetToProfileWorkTypes}
        />

        {/* Results Header */}
        {allJobs.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pl-2 pr-1 py-1 mb-4 items-center justify-center sm:justify-start p-1 px-0.5">
            {/* Left side: Last updated info (its own row on mobile) */}
            <div className="text-sm text-center sm:text-left text-xs text-muted-foreground">
              <span className="font-semibold text-wev-brand-accent">{t('home.lastUpdated')} </span>
              <span>{lastScrapeTime || t('home.unknown')}</span>
            </div>

            {/* Controls row: sort and expand/collapse - appears below on mobile */}
            <div className="flex items-center gap-2 mt-2 sm:mt-0 gap-2 sm:justify-end">
              <SortDropdown
                sortBy={sortBy}
                onChange={(s) => setSortBy(s)}
                showMatchOption={!!user}
              />

              <div className="w-0.5 h-3.5 bg-border" />

              <ExpandAllToggle
                allExpanded={allJobsExpanded}
                onToggle={() => setAllJobsExpanded(!allJobsExpanded)}
              />
            </div>
          </div>
        )}

        <JobListings
          jobs={paginatedJobs}
          loading={loading}
          error={error}
          allExpanded={allJobsExpanded}
          matchData={matchData}
          bookmarkedJobIds={bookmarkedJobIds}
          selectedWorkTypes={selectedWorkTypes}
          onJobSseChange={(jobId, isSse) =>
            setAllJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, is_sse: isSse } : j)))
          }
          onJobBookmarkChange={(job, bookmarked) => {
            setBookmarkedJobIds((prev) => {
              const next = new Set(prev);
              if (bookmarked) next.add(job.id);
              else next.delete(job.id);
              return next;
            });
          }}
        />

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredJobs.length}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      </div>
    </main>
  );
}
