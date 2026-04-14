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
    const rootDir = path.resolve(__dirname, '../');
    const envPath = path.join(rootDir, '.env');
    const envTestPath = path.join(rootDir, '.env.test');

    // Load base env without overriding vars already set in the process
    loadEnv({ path: envPath });
    // Overlay test-specific overrides
    if (fs.existsSync(envTestPath)) {
      loadEnv({ path: envTestPath, override: true });
    }

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
    
    // Bust Next.js data cache because it might have cached the pre-seeded DB
    // state when it booted up or during a previous npm run build.
    const revalidateSecret = process.env.REVALIDATION_SECRET || process.env.REVALIDATE_SECRET;
    if (revalidateSecret) {
      console.log('▶ Revalidating Next.js job cache...');
      try {
        const res = await fetch(`http://localhost:3000/api/revalidate-jobs`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${revalidateSecret}`,
            },
          });
          if (!res.ok) console.warn('⚠️ Cache revalidation returned non-OK status:', await res.text());
        else console.log('✅ E2E Global Setup: Next.js cache revalidated.');
      } catch (err) {
        console.warn('⚠️ Could not reach Next.js cache endpoint (is webServer alive?):', err);
      }
    } else {
      console.warn('⚠️ REVALIDATION_SECRET missing in E2E setup, Next.js cache might be stale.');
    }
  } catch (error) {
    console.error('❌ E2E Global Setup: Failed to prepare environment:', error);
    process.exit(1);
  }
}

export default globalSetup;
