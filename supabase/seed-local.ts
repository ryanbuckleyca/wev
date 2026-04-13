import { resetAndSeedDatabase } from './src/seeder';
import path from 'node:path';
import fs from 'node:fs';
import { config as loadEnv } from 'dotenv';

/**
 * Standalone script to seed the local database with the shared E2E dataset.
 * 
 * Usage from repo root:
 * npx tsx supabase/seed-local.ts
 */
async function main() {
  console.log('▶ Loading environment variables...');
  
  // Standard dotenv loading, prioritizing local .env and fallback to parent
  const envPath = fs.existsSync('.env') ? '.env' : path.join('..', '.env');
  loadEnv({ path: envPath });

  const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = process.env.SUPABASE_PROJECT_REF || 'localhost';

  if (!serviceRoleKey) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY is not set in environment.');
    process.exit(1);
  }

  try {
    console.log(`▶ Seeding project: ${projectRef} (${supabaseUrl})`);

    const config = {
      projectRef,
      serviceRoleKey,
      supabaseUrl,
    };

    // The resetAndSeedDatabase helper clears the tables before inserting
    await resetAndSeedDatabase(config);
    
    console.log('✅ Local database seeded with E2E dataset.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Seeding failed: ${message}`);
    process.exit(1);
  }
}

main();
