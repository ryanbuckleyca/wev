import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client. Uses service role key.
 * Only import this in API routes or Server Components — never in client components.
 * Created lazily so build can succeed without env vars; throws when used if vars are missing.
 */
let _client: SupabaseClient | null = null

export function getSupabaseServer(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL ?? process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
    if (!url || !key) {
      throw new Error(
        'Missing Supabase server env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_URL and SUPABASE_SECRET_KEY in .env for local dev).'
      )
    }
    _client = createClient(url, key)
  }
  return _client
}
