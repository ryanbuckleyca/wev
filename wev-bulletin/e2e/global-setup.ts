import { resetAndSeedDatabase } from '@supabase/seeder';
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Playwright Global Setup
 * Runs once before all tests to prepare the environment and seed the database.
 */
async function globalSetup() {
  console.log('▶ E2E Global Setup: Initializing test environment...');

  try {
    // Prioritize .env.test if it exists
    const envTestPath = path.resolve(__dirname, '../../.env.test');
    const envPath = fs.existsSync(envTestPath) ? envTestPath : path.resolve(__dirname, '../../.env');
    loadEnv({ path: envPath });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('❌ ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing during E2E setup.');
      process.exit(1);
    }

    // Safety check: Never seed production.
    // Validate against the actual URL hostname so a misconfigured SUPABASE_PROJECT_REF
    // cannot accidentally allow seeding a remote database.
    const { hostname } = new URL(supabaseUrl);
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocalHost) {
      console.error(
        `❌ ERROR: Refusing to seed a non-local database. SUPABASE_URL hostname is '${hostname}'.`,
      );
      process.exit(1);
    }

    console.log(`▶ Seeding test database: ${supabaseUrl}`);
    await resetAndSeedDatabase({
      supabaseUrl,
      serviceRoleKey,
      projectRef: 'localhost',
    });
    console.log('✅ E2E Global Setup: Database seeded successfully.');
  } catch (error) {
    console.error('❌ E2E Global Setup: Failed to prepare environment:', error);
    process.exit(1);
  }
}

export default globalSetup;
