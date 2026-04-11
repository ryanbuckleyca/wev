import {
  getOptionalEnv,
  getSupabaseDatabaseConfig,
  loadSupabaseEnv,
} from '@/lib/supabase/seed/env';

export const PLAYWRIGHT_PORT = 3000;
export const PLAYWRIGHT_BASE_URL = `http://localhost:${PLAYWRIGHT_PORT}`;

export { loadSupabaseEnv, getSupabaseDatabaseConfig };

export function getWebServerEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );

  // Tell Next.js we're in test mode, not production
  // This prevents .env.production from being loaded
  env.NODE_ENV = 'test';

  // Ensure auth emails generated during Playwright runs point back to the e2e app port.
  env.NEXT_PUBLIC_SITE_URL = PLAYWRIGHT_BASE_URL;

  // Override production Supabase config with test database config
  // This ensures the production build uses the test database
  const testConfig = getSupabaseDatabaseConfig();
  env.NEXT_PUBLIC_SUPABASE_URL = testConfig.supabaseUrl;

  // Use the publishable key from .env (test database)
  const testPublishableKey = getOptionalEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  if (testPublishableKey) {
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = testPublishableKey;
  }

  return env;
}

