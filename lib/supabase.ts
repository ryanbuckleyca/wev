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
  work_type: 'remote' | 'hybrid' | 'office'
  date_posted: string
  close_date: string | null
  wage: string | null
  listing_url: string
  employment_type?: string | null
  summary?: string | null
  is_sse?: boolean
  source?: string | null
  values?: string[]
  skills?: string[]
  /** Pre-resolved skill labels keyed by concept URI, injected by /api/bulletin */
  skill_labels?: Record<string, { term: string; definition: string | null; scope_note: string | null }>
}

export interface JobMatchData {
  score: number
  value_score?: number | null
  skill_score?: number | null
  shared_values: string[]
  shared_skills?: string[]
}

export interface ScrapeRun {
  id: string
  run_at: string
}
