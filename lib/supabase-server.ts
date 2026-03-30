import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client. Uses service role key.
 * Only import this in API routes or Server Components — never in client components.
 *
 * Creates the client once per module load. Safe because Next.js API routes run
 * in isolated module contexts per request in serverless environments, and the
 * client itself is stateless (no user session). If you need true per-request
 * isolation (e.g. long-lived Node.js server), pass the client as a parameter instead.
 */
let _client: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing Supabase server env. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY in .env for local dev).',
    );
  }
  _client = createClient(url, key);
  return _client;
}
