import { resetAndSeedDatabase } from "../supabase/src/seeder";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required");
  process.exit(1);
}

async function run() {
  console.log("Seeding database...");
  await resetAndSeedDatabase({
    projectRef: "localhost",
    serviceRoleKey,
    supabaseUrl,
  });
  console.log("Database seeded successfully!");
}

run().catch(console.error);
