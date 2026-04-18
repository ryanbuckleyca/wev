import { createClient, type SupabaseClient } from '@supabase/supabase-js';
 
/**
 * Server-only Supabase client. Uses service role key.
 * Only import this in API routes or Server Components — never in client components.
 *
 * Module-level singleton: correct for a service-role client with static credentials
 * on a long-lived Node process (Northflank). Fails hard at startup if env vars are missing.
 *
 * For user-scoped clients (RLS via JWT): create per-request with the user's token instead.
 */
const getSupabaseServer = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 
  if (!url || !key) {
    // Only throw if we are NOT in a build environment or if explicitly requested.
    // During 'next build', some routes are statically analyzed and this module is evaluated.
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      // Return a dummy client or just log a warning during build.
      // API routes that use this will be marked 'force-dynamic' so they won't actually
      // execute this code during build.
      console.warn('Supabase server env missing during build. Using dummy client.');
      return createClient('https://dummy.supabase.co', 'dummy-key');
    }
    throw new Error('Missing Supabase server env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
 
  return createClient(url, key, {
    auth: { persistSession: false },
  });
};
 
// Lazy-initialized singleton
let _supabaseServer: SupabaseClient | null = null;
 
/**
 * Lazy-initialized service-role client.
 * Using a Proxy to maintain the existing variable-style export for consumers.
 */
export const supabaseServer: SupabaseClient = new Proxy({} as unknown as SupabaseClient, {
  get(_, prop) {
    if (!_supabaseServer) {
      _supabaseServer = getSupabaseServer();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_supabaseServer as any)[prop as keyof SupabaseClient];
  },
});
