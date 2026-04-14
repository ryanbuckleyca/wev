import { createClient } from '@supabase/supabase-js';
import { setupTestEnv } from './env-setup';

/**
 * Returns true if the local Supabase instance appears to be running.
 * Used by integration tests to skip gracefully when the DB isn't available.
 */
export async function isLocalDatabaseAvailable(): Promise<boolean> {
  const { url, key } = setupTestEnv();
  if (!url || !key) return false;
  try {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await client.from('sources').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Creates a real Supabase client for integration tests.
 * Returns a client pointed at the local Supabase instance.
 * Queries will fail if Supabase isn't running — use isLocalDatabaseAvailable() to check first.
 */
export function getRealDatabaseClient() {
  const { url, key } = setupTestEnv();

  if (!url || !key) {
    throw new Error('Integration tests require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}
