import path from 'node:path';
import { config } from 'dotenv';

/**
 * Loads the test environment from the monorepo root.
 * Respects whatever env is already loaded (local or staging), then overlays
 * .env.test on top for test-specific overrides (NODE_ENV, etc.).
 * Throws if SUPABASE_URL points to production — tests must never run against prod.
 */
export function setupTestEnv() {
  const root = path.resolve(__dirname, '../..');

  // Load base env without overriding vars already set in the process
  config({ path: path.join(root, '.env') });
  // Overlay test-specific overrides (NODE_ENV=test, NEXT_PUBLIC_ENV_MODE=test)
  config({ path: path.join(root, '.env.test'), override: true });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (process.env.USE_PROD_DB === '1' || (url && url === process.env.SUPABASE_PROD_URL)) {
    throw new Error('Tests cannot run against the production database.');
  }

  return { url, key };
}
