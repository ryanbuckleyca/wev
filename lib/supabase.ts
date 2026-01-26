import { createClient } from '@supabase/supabase-js'

// Access env vars at module load time so Next.js embeds them in the bundle during build
// Support both NEXT_PUBLIC_SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_KEY for compatibility
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY

// Validate that env vars are present (this check happens at build time)
if (!supabaseUrl || !supabaseAnonKey) {
  // During build, this will fail if vars aren't set (which is what we want)
  // At runtime, if vars weren't embedded, this will also fail with a clear error
  throw new Error(
    'Missing Supabase environment variables. ' +
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set during build.'
  )
}

// Create client - Next.js will embed the env var values in the bundle at build time
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
