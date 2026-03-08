'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs'
import JobListings from '@/components/JobListings'
import JobFilters from '@/components/JobFilters'
import UserProfile from '@/components/UserProfile'
import LinkButton from '@/components/LinkButton'
import Button from '@/components/Button'
import { useRequireAuth } from '@/lib/hooks/useRequireAuth'
import { createClient } from '@/lib/supabase/client'
import type { JobPosting, JobMatchData } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import SortDropdown from '@/components/SortDropdown'
import ExpandAllToggle from '@/components/ExpandAllToggle'
import WatercolorBackground from '@/components/WatercolorBackground'
import ReScrapeButton from '@/components/ReScrapeButton'
import CopyAllJobsButton from '@/components/CopyAllJobsButton'
import Pagination from '@/components/Pagination'

const ITEMS_PER_PAGE = 20

export default function Home() {
  const t = useTranslations()
  const locale = useLocale()
  const { role, user } = useAuth()
  const [allJobs, setAllJobs] = useState<JobPosting[]>([])
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state - synced with URL via nuqs
  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''))
  const [selectedOrganizations, setSelectedOrganizations] = useQueryState('org', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedProvinces, setSelectedProvinces] = useQueryState('province', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedMunicipalities, setSelectedMunicipalities] = useQueryState('municipality', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedEmploymentTypes, setSelectedEmploymentTypes] = useQueryState('employment', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedSources, setSelectedSources] = useQueryState('source', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedWorkTypes, setSelectedWorkTypes] = useQueryState('workType', parseAsArrayOf(parseAsString).withDefault([]))
  const [showOnlySse, setShowOnlySse] = useQueryState('sse', parseAsBoolean.withDefault(true))
  const [showJobsWithoutSalary, setShowJobsWithoutSalary] = useQueryState('salary', parseAsBoolean.withDefault(true))
  const [postedWithin, setPostedWithin] = useQueryState(
    'posted',
    parseAsStringLiteral(['1-week', '2-weeks', '3-weeks', '1-month', 'any'] as const).withDefault('2-weeks')
  )
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [currentPage, setCurrentPage] = useQueryState('page', parseAsInteger.withDefault(1))
  const [allJobsExpanded, setAllJobsExpanded] = useState(true)
  
  // Sort state
  const [sortBy, setSortBy] = useQueryState(
    'sort',
    parseAsStringLiteral(['date-desc', 'date-asc', 'match-desc', 'salary-desc', 'salary-asc', 'org-asc'] as const).withDefault('date-desc')
  )
  
  // Match data state
  const [matchData, setMatchData] = useState<Map<string, JobMatchData>>(new Map())
  // Bookmarked job IDs (batch-fetched for logged-in users)
  const [bookmarkedJobIds, setBookmarkedJobIds] = useState<Set<string>>(new Set())

  

  const handleExpandAll = (expanded: boolean) => {
    console.log('handleExpandAll called:', expanded)
    setAllJobsExpanded(expanded)
  }

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('Data fetching timeout - forcing completion')
      setLoading(false)
      setError(t('home.errors.timeout'))
    }, 10000) // 10 second timeout

    try {
      const res = await fetch('/api/bulletin')
      clearTimeout(timeoutId)
      
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? t('home.errors.loadFailed'))
      }
      const { jobs: jobsData, lastScrapeTime: rawScrapeTime } = await res.json()

      if (rawScrapeTime) {
        const timestamp = rawScrapeTime
        let date: Date
        if (typeof timestamp === 'string') {
          if (!timestamp.endsWith('Z') && !timestamp.match(/[+-]\d{2}:\d{2}$/)) {
            date = new Date(timestamp + 'Z')
          } else {
            date = new Date(timestamp)
          }
        } else {
          date = new Date(timestamp)
        }
        // Map locale to proper locale code for date formatting
        const dateLocale = locale === 'fr' ? 'fr-CA' : 'en-CA'
        setLastScrapeTime(
          date.toLocaleString(dateLocale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York',
            timeZoneName: 'short',
          })
        )
      } else {
        setLastScrapeTime(null)
      }

      setAllJobs(jobsData ?? [])
      setCurrentPage(1)
      // Match data and bookmarks are fetched by the useEffect when userId + allJobs are ready
    } catch (err) {
      clearTimeout(timeoutId)
      console.error('Error fetching data:', err)
      const errorMessage = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : t('home.errors.loadFailed')
      setError(errorMessage)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  // Fetch bookmarks for job IDs (only when user is logged in)
  const fetchBookmarks = async (jobIds: string[]) => {
    if (!user || jobIds.length === 0) return new Set<string>()
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('bookmarks')
        .select('job_id')
        .eq('user_id', user.id)
        .in('job_id', jobIds)

      if (error) {
        console.error('Error fetching bookmarks:', error)
        return new Set<string>()
      }
      return new Set((data ?? []).map((b: { job_id: string }) => b.job_id))
    } catch (error) {
      console.error('Error fetching bookmarks:', error)
      return new Set<string>()
    }
  }

  // Fetch match data for all jobs (only when user is logged in)
  const fetchMatchData = async (jobs: JobPosting[]) => {
    if (!user) return new Map()

    try {
      const supabase = createClient()
      const { data: matches, error } = await supabase
        .from('job_matches')
        .select('job_id, score, value_score, skill_score, shared_values, shared_skills')
        .eq('user_id', user.id)
        .in('job_id', jobs.map(job => job.id))

      if (error) {
        console.error('Error fetching match data:', error)
        return new Map()
      }

      const matchMap = new Map()
      matches?.forEach((match: { job_id: string; score: number; value_score?: number | null; skill_score?: number | null; shared_values: string[]; shared_skills?: string[] }) => {
        matchMap.set(match.job_id, match)
      })
      
      return matchMap
    } catch (error) {
      console.error('Error fetching match data:', error)
      return new Map()
    }
  }

  // Filter and sort jobs based on search, filters, and sort option
  const filteredJobs = useMemo(() => {
    let filtered = allJobs.filter((job) => {
      // Search filter (case-insensitive)
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          job.job_title.toLowerCase().includes(query) ||
          (job.summary && job.summary.toLowerCase().includes(query)) ||
          job.organization.toLowerCase().includes(query) ||
          (job.location && job.location.toLowerCase().includes(query)) ||
          (job.municipality && job.municipality.toLowerCase().includes(query)) ||
          (job.province && job.province.toLowerCase().includes(query))
        if (!matchesSearch) return false
      }

      // Organization filter
      if (selectedOrganizations.length > 0) {
        if (!selectedOrganizations.includes(job.organization)) return false
      }

      // Work type filter (remote/hybrid/office)
      if (selectedWorkTypes.length > 0) {
        if (!selectedWorkTypes.includes(job.work_type)) return false
      }

      // SSE filter: when "show only SSE" is on, hide jobs not flagged as SSE
      if (showOnlySse && !job.is_sse) {
        return false
      }

      // Salary filter: when "show jobs without salary" is off, hide jobs with no wage
      if (!showJobsWithoutSalary) {
        if (!job.wage || !String(job.wage).trim()) return false
      }

      // Posted-within filter: hide jobs older than the selected window
      if (postedWithin !== 'any') {
        const daysAgo = postedWithin === '1-week' ? 7 : postedWithin === '2-weeks' ? 14 : postedWithin === '3-weeks' ? 21 : 30
        const cutoffMs = Date.now() - daysAgo * 24 * 60 * 60 * 1000
        let postedMs: number
        try {
          const raw = job.date_posted
          const str = typeof raw === 'string' && !raw.endsWith('Z') && !raw.match(/[+-]\d{2}:\d{2}$/) ? `${raw}Z` : raw
          postedMs = new Date(str).getTime()
        } catch {
          postedMs = 0
        }
        if (Number.isNaN(postedMs) || postedMs < cutoffMs) return false
      }

      // Province filter
      // Jobs with null province should show when filters are applied (null doesn't narrow down)
      if (selectedProvinces.length > 0) {
        if (job.province && !selectedProvinces.includes(job.province)) return false
        // If job.province is null, it passes (shows for any province filter)
      }

      // Municipality filter
      // Jobs with null municipality should show when filters are applied (null doesn't narrow down)
      if (selectedMunicipalities.length > 0) {
        if (job.municipality && !selectedMunicipalities.includes(job.municipality)) return false
        // If job.municipality is null, it passes (shows for any municipality filter)
      }

      // Employment type filter
      if (selectedEmploymentTypes.length > 0) {
        if (!job.employment_type || !selectedEmploymentTypes.includes(job.employment_type)) {
          return false
        }
      }

      // Source filter
      if (selectedSources.length > 0) {
        if (!job.source || !selectedSources.includes(job.source)) return false
      }

      return true
    })

    // Sort jobs
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.date_posted).getTime() - new Date(a.date_posted).getTime()
        case 'date-asc':
          return new Date(a.date_posted).getTime() - new Date(b.date_posted).getTime()
        case 'match-desc':
          const aMatch = matchData.get(a.id)?.score || 0
          const bMatch = matchData.get(b.id)?.score || 0
          return bMatch - aMatch
        case 'salary-desc':
          // Sort by salary high to low (jobs without salary go to end)
          const aSalary = a.wage ? parseFloat(a.wage.replace(/[^0-9.-]/g, '')) || 0 : -1
          const bSalary = b.wage ? parseFloat(b.wage.replace(/[^0-9.-]/g, '')) || 0 : -1
          return bSalary - aSalary
        case 'salary-asc':
          // Sort by salary low to high (jobs without salary go to end)
          const aSalaryAsc = a.wage ? parseFloat(a.wage.replace(/[^0-9.-]/g, '')) || 0 : Infinity
          const bSalaryAsc = b.wage ? parseFloat(b.wage.replace(/[^0-9.-]/g, '')) || 0 : Infinity
          return aSalaryAsc - bSalaryAsc
        case 'org-asc':
          // Sort by organization A-Z
          return a.organization.localeCompare(b.organization)
        default:
          return 0
      }
    })
  }, [allJobs, searchQuery, selectedOrganizations, selectedProvinces, selectedMunicipalities, selectedEmploymentTypes, selectedSources, selectedWorkTypes, showOnlySse, showJobsWithoutSalary, postedWithin, sortBy, matchData])

  // Paginate filtered jobs
  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return filteredJobs.slice(startIndex, endIndex)
  }, [filteredJobs, currentPage])

  // Reset to page 1 when filters or sort change (only if not already on page 1)
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1)
    }
  }, [searchQuery, selectedOrganizations, selectedProvinces, selectedMunicipalities, selectedEmploymentTypes, selectedSources, selectedWorkTypes, showOnlySse, showJobsWithoutSalary, postedWithin, sortBy])

  useEffect(() => {
    fetchData()
  }, [])

  // Refetch match data and bookmarks when user changes (by id, not object reference)
  // Using user?.id avoids refetch on token refresh when switching tabs
  const userId = user?.id ?? null
  useEffect(() => {
    if (userId && allJobs.length > 0) {
      Promise.all([
        fetchMatchData(allJobs),
        fetchBookmarks(allJobs.map(j => j.id)),
      ]).then(([matches, bookmarked]) => {
        setMatchData(matches)
        setBookmarkedJobIds(bookmarked)
      })
    } else {
      setMatchData(new Map())
      setBookmarkedJobIds(new Set())
    }
  }, [userId, allJobs.length])

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE)

  return (
    <main className="min-h-screen pb-8 relative overflow-hidden" style={{
      background: 'var(--bg)'
    }}>
      <WatercolorBackground />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10">
        {/* Home page hero section */}
        <header className="mb-8">
          <img
            src="https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png"
            alt="wev"
            className="main-logo wev-logotype w-[100px] h-auto mb-2"
          />
          <p className="text-xl font-medium text-wev-primary-text">{t('home.heading')}</p>
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
        />

        {/* Results Header */}
        {allJobs.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pl-2 pr-1 py-1 mb-4 items-center justify-center sm:justify-start p-1 px-0.5">
            {/* Left side: Last updated info (its own row on mobile) */}
            <div className="text-sm text-center sm:text-left text-xs text-wev-text-secondary">
              <span className="font-semibold text-wev-accent">{t('home.lastUpdated')} </span>
              <span>{lastScrapeTime || t('home.unknown')}</span>
            </div>

            {/* Controls row: sort and expand/collapse - appears below on mobile */}
            <div className="flex items-center gap-2 mt-2 sm:mt-0 gap-2 sm:justify-end">
              <SortDropdown
                sortBy={sortBy}
                onChange={(s) => setSortBy(s)}
                showMatchOption={!!user}
              />

              <div className="w-0.5 h-3.5 bg-wev-border" />

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
          onJobSseChange={(jobId, isSse) =>
            setAllJobs((prev) =>
              prev.map((j) => (j.id === jobId ? { ...j, is_sse: isSse } : j))
            )
          }
          onJobBookmarkChange={(job, bookmarked) => {
            setBookmarkedJobIds((prev) => {
              const next = new Set(prev)
              if (bookmarked) next.add(job.id)
              else next.delete(job.id)
              return next
            })
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
  )
}
