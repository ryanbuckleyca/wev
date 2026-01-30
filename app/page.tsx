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
  }, [allJobs, searchQuery, selectedOrganizations, selectedProvinces, selectedMunicipalities, selectedEmploymentTypes, remoteFilter])

  // Paginate filtered jobs
  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return filteredJobs.slice(startIndex, endIndex)
  }, [filteredJobs, currentPage])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedOrganizations, selectedProvinces, selectedMunicipalities, selectedEmploymentTypes, remoteFilter])

  useEffect(() => {
    fetchData()
  }, [])

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE)

  return (
    <main className="min-h-screen bg-wev-offwhite py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold font-serif text-black mb-8">
          WEV Bulletin - Job Postings
        </h1>

        {/* Last Scrape Time */}
        <div className="bg-white border border-wev-ash rounded-lg p-4 mb-6">
          <p className="text-sm text-black">
            <span className="font-semibold text-wev-lavender">Last updated: </span>
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
        />

        {/* Results count */}
        {!loading && (
          <div className="mb-4 text-sm text-black">
            {filteredJobs.length === allJobs.length ? (
              <span>
                {filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'}
                {filteredJobs.length <= ITEMS_PER_PAGE && ' (all shown)'}
              </span>
            ) : (
              <span>
                {filteredJobs.length} of {allJobs.length} {allJobs.length === 1 ? 'job' : 'jobs'}
              </span>
            )}
          </div>
        )}

        <JobListings jobs={paginatedJobs} loading={loading} error={error} />

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
