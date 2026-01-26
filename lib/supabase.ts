import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Support both NEXT_PUBLIC_SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_KEY for compatibility
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // During build time, Next.js may try to evaluate this module even for client components
    // Create a placeholder client to allow build to complete
    // The actual error will be caught at runtime when the client is used
    if (typeof window === 'undefined') {
      // Server-side (build time): create a placeholder client
      supabaseClient = createClient('https://placeholder.supabase.co', 'placeholder-key')
      return supabaseClient
    }
    // Client-side (runtime): throw error if env vars are missing
    throw new Error('Missing Supabase environment variables')
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
  return supabaseClient
}

// Use a Proxy to lazily initialize the client
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    const client = getSupabaseClient()
    const value = (client as any)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  }
})

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
