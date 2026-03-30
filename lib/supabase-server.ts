import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client. Uses service role key.
 * Only import this in API routes or Server Components — never in client components.
 *
 * Module-level singleton: correct for a service-role client with static credentials
 * on a long-lived Node process (Northflank). Fails hard at startup if env vars are missing.
 *
 * For user-scoped clients (RLS via JWT): create per-request with the user's token instead.
 */
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error(
    'Missing Supabase server env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY in .env for local dev).',
  );
}

export const supabaseServer = createClient(url, key, {
  auth: { persistSession: false },
});
