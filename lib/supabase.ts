import { createClient } from '@supabase/supabase-js'

// Access env vars at module load time
// In SSR mode, these are available at runtime from the server environment
// Support both NEXT_PUBLIC_SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_KEY for compatibility
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_KEY

// Validate that env vars are present
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables.')
}

// Create client - env vars are available at runtime in SSR mode
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export interface JobPosting {
  id: string
  job_title: string
  organization: string
  location: string
  date_posted: string
  close_date: string | null
  wage: string | null
  listing_url: string
}

export interface ScrapeRun {
  id: string
  run_at: string
}
