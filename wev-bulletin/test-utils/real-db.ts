import { createClient } from '@supabase/supabase-js';
import { setupTestEnv } from './env-setup';

/**
 * Creates a real Supabase client pointed at the local Supabase instance.
 * Used by *.db.test.ts files — requires supabase start to be running.
 */
export function getRealDatabaseClient() {
  const { url, key } = setupTestEnv();

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Is supabase running?');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
