import { resetAndSeedDatabase } from "../../supabase/src/seeder";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Load environment variables from .env in the root of the monorepo
loadEnv({ path: path.resolve(process.cwd(), '../.env') });

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Error: Missing Supabase credentials in environment variables.");
    process.exit(1);
  }

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]; // Derive from URL

  console.log(`▶ Seeding local database for project: ${projectRef}`);

  try {
    await resetAndSeedDatabase({
      projectRef,
      serviceRoleKey,
      supabaseUrl,
    });
    console.log("✅ Local database seeded successfully with deterministic data.");
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Local database seeding failed: ${message}`);
    process.exit(1);
  }
}

main();
