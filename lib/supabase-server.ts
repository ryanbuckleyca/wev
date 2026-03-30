import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client. Uses service role key.
 * Only import this in API routes or Server Components — never in client components.
 *
 * Returns a new client per call — no module-level singleton that could leak
 * state across requests in the same Node.js process or across hot reloads in dev.
 */
export function getSupabaseServer(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing Supabase server env. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY in .env for local dev).',
    );
  }
  return createClient(url, key);
}
