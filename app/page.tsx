'use client'

import { useEffect, useState } from 'react'
import { supabase, JobPosting, ScrapeRun } from '@/lib/supabase'
import ReScrapeButton from '@/components/ReScrapeButton'
import JobListings from '@/components/JobListings'
import CopyAllJobsButton from '@/components/CopyAllJobsButton'

// Force dynamic rendering - this page uses client-side data fetching
export const dynamic = 'force-dynamic'
export const revalidate = 0 // Disable static generation, always render dynamically

export default function Home() {
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch last scrape time
      const { data: scrapeData, error: scrapeError } = await supabase
        .from('scrape_runs')
        .select('run_at')
        .order('run_at', { ascending: false })
        .limit(1)
        .single()

      if (scrapeError && scrapeError.code !== 'PGRST116') {
        // PGRST116 is "no rows returned", which is okay
        throw scrapeError
      }

      if (scrapeData) {
        // Parse the UTC timestamp from the database
        // The scraper stores timestamps as ISO format without timezone (e.g., "2026-01-26T05:12:00")
        // We need to explicitly treat it as UTC by appending 'Z'
        const timestamp = scrapeData.run_at
        let date: Date
        
        if (typeof timestamp === 'string') {
          // If it doesn't have a timezone indicator, treat it as UTC
          if (!timestamp.endsWith('Z') && !timestamp.match(/[+-]\d{2}:\d{2}$/)) {
            date = new Date(timestamp + 'Z')
          } else {
            date = new Date(timestamp)
          }
        } else {
          date = new Date(timestamp)
        }
        
        // Format in EST/EDT (America/New_York automatically handles EST/EDT)
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

      // Fetch job postings
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('id, job_title, organization, location, date_posted, close_date, wage, listing_url')
        .order('date_posted', { ascending: false })

      if (jobsError) {
        throw jobsError
      }

      setJobs(jobsData || [])
    } catch (err) {
      console.error('Error fetching data:', err)
      const errorMessage = err instanceof Error 
        ? err.message 
        : typeof err === 'object' && err !== null && 'message' in err
        ? String(err.message)
        : 'Failed to load data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

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
          <CopyAllJobsButton jobs={jobs} />
        </div>

        <JobListings jobs={jobs} loading={loading} error={error} />
      </div>
    </main>
  )
}
