import { resetAndSeedDatabase } from '@/lib/supabase/seed/seeder';
import { getSupabaseDatabaseConfig, loadSupabaseEnv } from '@/lib/supabase/seed/env';

/**
 * Standalone script to seed the local database with the shared E2E dataset.
 * 
 * Usage from wev-bulletin directory:
 * npx tsx scripts/seed-local.ts
 */
async function main() {
  console.log('▶ Loading environment variables...');
  
  try {
    // This loads .env from the current working directory
    loadSupabaseEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`⚠ Warning while loading env: ${message}`);
    console.log('  (Proceeding with existing process.env variables)');
  }

  try {
    const config = getSupabaseDatabaseConfig();
    console.log(`▶ Seeding project: ${config.projectRef} (${config.supabaseUrl})`);

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
