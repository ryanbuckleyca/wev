'use client'

import { useEffect, useState, useMemo } from 'react'
import type { JobPosting } from '@/lib/supabase'
import ReScrapeButton from '@/components/ReScrapeButton'
import JobListings from '@/components/JobListings'
import CopyAllJobsButton from '@/components/CopyAllJobsButton'
import JobFilters from '@/components/JobFilters'
import Pagination from '@/components/Pagination'

// Force dynamic rendering - this page uses client-side data fetching
export const dynamic = 'force-dynamic'
export const revalidate = 0 // Disable static generation, always render dynamically

const ITEMS_PER_PAGE = 20

export default function Home() {
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
  const [remoteFilter, setRemoteFilter] = useState<'all' | 'remote-only' | 'hide-remote'>('all')
  const [showOnlySse, setShowOnlySse] = useState(true)
  const [showJobsWithoutSalary, setShowJobsWithoutSalary] = useState(false)
  const [postedWithin, setPostedWithin] = useState<'1-week' | '2-weeks' | '3-weeks' | '1-month' | 'any'>('2-weeks')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/bulletin')
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
      console.error('Error fetching data:', err)
      const errorMessage = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to load data'
      setError(errorMessage)
    } finally {
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

      // Remote filter
      if (remoteFilter === 'remote-only' && !job.is_remote) {
        return false
      }
      if (remoteFilter === 'hide-remote' && job.is_remote) {
        return false
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

      return true
    })
  }, [allJobs, searchQuery, selectedOrganizations, selectedProvinces, selectedMunicipalities, selectedEmploymentTypes, remoteFilter, showOnlySse, showJobsWithoutSalary, postedWithin])

  // Paginate filtered jobs
  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return filteredJobs.slice(startIndex, endIndex)
  }, [filteredJobs, currentPage])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedOrganizations, selectedProvinces, selectedMunicipalities, selectedEmploymentTypes, remoteFilter, showOnlySse, showJobsWithoutSalary, postedWithin])

  useEffect(() => {
    fetchData()
  }, [])

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE)

  const hasActiveFilters =
    !!searchQuery ||
    selectedOrganizations.length > 0 ||
    selectedProvinces.length > 0 ||
    selectedMunicipalities.length > 0 ||
    selectedEmploymentTypes.length > 0 ||
    remoteFilter !== 'all' ||
    !showOnlySse ||
    showJobsWithoutSalary ||
    postedWithin !== '2-weeks'

  // Auto-expand filters when user has active filters
  useEffect(() => {
    if (hasActiveFilters && !filtersExpanded) {
      setFiltersExpanded(true)
    }
  }, [hasActiveFilters])

  const filterStateSummary = useMemo(() => {
    const parts: string[] = []
    parts.push(
      postedWithin === '1-week'
        ? 'Posted: 1 week'
        : postedWithin === '2-weeks'
          ? 'Posted: 2 weeks'
          : postedWithin === '3-weeks'
            ? 'Posted: 3 weeks'
            : postedWithin === '1-month'
              ? 'Posted: 1 month'
              : 'Posted: any'
    )
    parts.push(showOnlySse ? 'SSE: Only' : 'SSE: All')
    parts.push(
      remoteFilter === 'all' ? 'Remote: Show' : remoteFilter === 'remote-only' ? 'Remote: Only' : 'Remote: Hide'
    )
    parts.push(showJobsWithoutSalary ? 'Without salary: Show' : 'Without salary: Hide')
    if (searchQuery) {
      const q = searchQuery.length > 18 ? `${searchQuery.slice(0, 18)}…` : searchQuery
      parts.push(`Search: "${q}"`)
    }
    if (selectedProvinces.length > 0) parts.push(selectedProvinces.length === 1 ? '1 province' : `${selectedProvinces.length} provinces`)
    if (selectedMunicipalities.length > 0) parts.push(selectedMunicipalities.length === 1 ? '1 municipality' : `${selectedMunicipalities.length} municipalities`)
    if (selectedOrganizations.length > 0) parts.push(selectedOrganizations.length === 1 ? '1 organization' : `${selectedOrganizations.length} organizations`)
    if (selectedEmploymentTypes.length > 0) parts.push(selectedEmploymentTypes.length === 1 ? '1 employment type' : `${selectedEmploymentTypes.length} employment types`)
    return parts
  }, [searchQuery, postedWithin, showJobsWithoutSalary, showOnlySse, remoteFilter, selectedProvinces.length, selectedMunicipalities.length, selectedOrganizations.length, selectedEmploymentTypes.length])

  const clearAllFilters = () => {
    setSearchQuery('')
    setSelectedOrganizations([])
    setSelectedProvinces([])
    setSelectedMunicipalities([])
    setSelectedEmploymentTypes([])
    setRemoteFilter('all')
    setShowOnlySse(true)
    setShowJobsWithoutSalary(false)
    setPostedWithin('2-weeks')
  }

  return (
    <main className="min-h-screen bg-wev-bg py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <img
            src="https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png"
            alt="wev"
            className="wev-logotype w-[100px] h-auto mb-2 drop-shadow-[0_4px_6px_rgba(135,92,116,0.15)]"
          />
          <p className="text-xl font-medium text-wev-primary-text">Bulletin – Job Postings</p>
        </header>

        {/* Last Scrape Time */}
        <div className="bg-wev-surface border border-wev-border rounded-wev-card p-4 mb-6 shadow-wev-card">
          <p className="text-sm text-wev-text-primary">
            <span className="font-semibold text-wev-accent">Last updated: </span>
            {lastScrapeTime ? (
              <span>{lastScrapeTime}</span>
            ) : (
              <span className="italic">No updates found</span>
            )}
          </p>
        </div>

        <div className="flex justify-start items-center gap-4 mb-6">
          <ReScrapeButton onComplete={fetchData} />
          <CopyAllJobsButton jobs={filteredJobs} />
        </div>

        {/* Filters */}
        <JobFilters
          jobs={allJobs}
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
          remoteFilter={remoteFilter}
          onRemoteFilterChange={setRemoteFilter}
          showOnlySse={showOnlySse}
          onShowOnlySseChange={setShowOnlySse}
          showJobsWithoutSalary={showJobsWithoutSalary}
          onShowJobsWithoutSalaryChange={setShowJobsWithoutSalary}
          postedWithin={postedWithin}
          onPostedWithinChange={setPostedWithin}
          filtersExpanded={filtersExpanded}
          onFiltersExpandedChange={setFiltersExpanded}
        />

        {/* Results count and active filters */}
        {!loading && (
          <div className="mb-4 text-sm text-wev-text-primary" aria-live="polite" aria-atomic="true">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {filteredJobs.length === allJobs.length ? (
                  <>
                    {filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'}
                    {filteredJobs.length <= ITEMS_PER_PAGE && filteredJobs.length > 0 && ' (all shown)'}
                  </>
                ) : (
                  <>
                    Showing {filteredJobs.length} of {allJobs.length} {allJobs.length === 1 ? 'job' : 'jobs'}
                  </>
                )}
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-wev-accent hover:text-wev-primary-text hover:underline focus:outline-none focus:ring-2 focus:ring-wev-primary focus:ring-offset-1 rounded"
                  aria-label="Reset all filters to defaults"
                >
                  Reset filters
                </button>
              )}
            </div>
            <p className="mt-1.5 text-wev-text-secondary" aria-label="Filter state">
              {filterStateSummary.join(' · ')}
            </p>
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setFiltersExpanded((prev) => !prev)}
                className="text-sm text-wev-accent hover:text-wev-primary-text hover:underline focus:outline-none focus:ring-2 focus:ring-wev-primary focus:ring-offset-1 rounded"
                aria-expanded={filtersExpanded}
                aria-controls="job-filters-content"
              >
                {filtersExpanded ? 'Hide filters' : 'Show filters'}
              </button>
            </div>
          </div>
        )}

        <JobListings
          jobs={paginatedJobs}
          loading={loading}
          error={error}
          onJobSseChange={(jobId, isSse) =>
            setAllJobs((prev) =>
              prev.map((j) => (j.id === jobId ? { ...j, is_sse: isSse } : j))
            )
          }
        />

        {/* Pagination */}
        {!loading && filteredJobs.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredJobs.length}
            itemsPerPage={ITEMS_PER_PAGE}
          />
        )}
      </div>
    </main>
  )
}
