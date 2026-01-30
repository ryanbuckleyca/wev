/**
 * Shared types for bulletin data. Supabase client is server-only — see lib/supabase-server.ts.
 * Do not add any env vars or createClient here; they would be exposed to the client bundle.
 */

export interface JobPosting {
  id: string
  job_title: string
  organization: string
  location: string
  municipality: string | null
  province: string | null
  is_remote: boolean
  date_posted: string
  close_date: string | null
  wage: string | null
  listing_url: string
  employment_type?: string | null
}

export interface ScrapeRun {
  id: string
  run_at: string
}
