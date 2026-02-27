'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import type { JobPosting } from '@/lib/supabase'
import ReScrapeButton from '@/components/ReScrapeButton'
import JobListings from '@/components/JobListings'
import CopyAllJobsButton from '@/components/CopyAllJobsButton'
import JobFilters from '@/components/JobFilters'
import Pagination from '@/components/Pagination'
import { useAuth } from '@/contexts/AuthContext'
import ButtonLink from '@/components/ButtonLink'

// Force dynamic rendering - this page uses client-side data fetching
export const revalidate = 0 // Disable static generation, always render dynamically

const ITEMS_PER_PAGE = 20

export default function Home() {
  const { role } = useAuth()
  const [allJobs, setAllJobs] = useState<JobPosting[]>([])
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>([])
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>([])
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<string[]>([])
  const [selectedEmploymentTypes, setSelectedEmploymentTypes] = useState<string[]>([])
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<string[]>([])
  const [showOnlySse, setShowOnlySse] = useState(true)
  const [showJobsWithoutSalary, setShowJobsWithoutSalary] = useState(true)
  const [postedWithin, setPostedWithin] = useState<'1-week' | '2-weeks' | '3-weeks' | '1-month' | 'any'>('2-weeks')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [allJobsExpanded, setAllJobsExpanded] = useState(true)

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
      setError('Request timed out. Please refresh the page.')
    }, 10000) // 10 second timeout

    try {
      const res = await fetch('/api/bulletin')
      clearTimeout(timeoutId)
      
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to load data')
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
        setLastScrapeTime(
          date.toLocaleString('en-US', {
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
    } catch (err) {
      clearTimeout(timeoutId)
      console.error('Error fetching data:', err)
      const errorMessage = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to load data'
      setError(errorMessage)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  // Filter jobs based on search and filters
  const filteredJobs = useMemo(() => {
    return allJobs.filter((job) => {
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
  }, [allJobs, searchQuery, selectedOrganizations, selectedProvinces, selectedMunicipalities, selectedEmploymentTypes, selectedSources, selectedWorkTypes, showOnlySse, showJobsWithoutSalary, postedWithin])

  // Paginate filtered jobs
  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return filteredJobs.slice(startIndex, endIndex)
  }, [filteredJobs, currentPage])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedOrganizations, selectedProvinces, selectedMunicipalities, selectedEmploymentTypes, selectedSources, selectedWorkTypes, showOnlySse, showJobsWithoutSalary, postedWithin])

  useEffect(() => {
    fetchData()
  }, [])

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE)

  return (
    <main className="min-h-screen bg-wev-bg pb-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Home page hero section */}
        <header className="mb-8">
          <img
            src="https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png"
            alt="wev"
            className="main-logo wev-logotype w-[100px] h-auto mb-2"
          />
          <p className="text-xl font-medium text-wev-primary-text">Bulletin – Job Postings</p>
        </header>

        {/* Action Buttons - Admin Only */}
        {role === 'admin' && (
          <div className="flex flex-col sm:flex-row justify-start items-stretch sm:items-center gap-4 mb-6">
            {/* Mobile: Stacked vertically */}
            <div className="flex flex-col gap-4 sm:hidden">
              <ReScrapeButton onComplete={fetchData} />
              <CopyAllJobsButton jobs={filteredJobs} />
            </div>
            
            {/* Desktop: Side by side */}
            <div className="hidden sm:flex sm:gap-4">
              <ReScrapeButton onComplete={fetchData} />
              <CopyAllJobsButton jobs={filteredJobs} />
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

        {/* Expand/collapse all jobs */}
        {!loading && (
          <div className="mb-4 flex justify-between items-center" aria-live="polite" aria-atomic="true">
            <p className="text-sm text-wev-text-secondary">
              <span className="font-semibold text-wev-accent">Last updated: </span>
              {lastScrapeTime ? (
                <span>{lastScrapeTime}</span>
              ) : (
                <span>Unknown</span>
              )}
            </p>
            <ButtonLink
              onClick={() => setAllJobsExpanded(!allJobsExpanded)}
              tone="accent"
              size="sm"
              title={allJobsExpanded ? 'Collapse all jobs' : 'Expand all jobs'}
            >
              {allJobsExpanded ? 'Collapse all' : 'Expand all'}
            </ButtonLink>
          </div>
        )}

        <JobListings
          jobs={paginatedJobs}
          loading={loading}
          error={error}
          allExpanded={allJobsExpanded}
          onJobSseChange={(jobId, isSse) =>
            setAllJobs((prev) =>
              prev.map((j) => (j.id === jobId ? { ...j, is_sse: isSse } : j))
            )
          }
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
