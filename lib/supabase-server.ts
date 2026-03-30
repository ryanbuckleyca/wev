import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client. Uses service role key.
 * Only import this in API routes or Server Components — never in client components.
 *
 * Singleton per module — safe in Next.js serverless (isolated module context per request)
 * and avoids the cost of re-creating the client on every call in long-lived processes.
 */
let _client: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase server env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY in .env for local dev).',
    );
  }

  _client = createClient(url, key);
  return _client;
}
