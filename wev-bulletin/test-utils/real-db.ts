import { createClient } from '@supabase/supabase-js';
import { setupTestEnv } from './env-setup';

/**
 * Creates a real Supabase client for integration tests.
 * This should ONLY be used in tests that have access to the local Supabase environment.
 */
export function getRealDatabaseClient() {
  const { url, key } = setupTestEnv();

  if (!url || !key || url.includes('test.supabase.co')) {
    throw new Error('Integration tests require a real database. Ensure .env.test is configured and reachable.');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}
