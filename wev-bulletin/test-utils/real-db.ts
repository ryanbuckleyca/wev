import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

/**
 * Creates a real Supabase client (service role) for integration tests.
 * Bypasses the Vitest mocks by explicitly loading .env.test and 
 * creating a fresh client.
 */
export function getRealDatabaseClient() {
  // Load .env.test from the monorepo root, overriding any existing mocks
  config({ 
    path: path.resolve(__dirname, '../../.env.test'),
    override: true 
  });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || url.includes('test.supabase.co')) {
    throw new Error('Integration tests require a real database. Ensure .env.test is configured and reachable.');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
