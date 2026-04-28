import { resetAndSeedDatabase } from "@supabase/seeder";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";

/**
 * Load environment variables consistently from the project root.
 */
function loadEnvironmentVariables() {
  const rootDir = path.resolve(__dirname, "../");
  const envPath = path.join(rootDir, ".env");
  const envTestPath = path.join(rootDir, ".env.test");

  loadEnv({ path: envPath });
  if (fs.existsSync(envTestPath)) {
    loadEnv({ path: envTestPath, override: true });
  }
}

/**
 * Safety checks to prevent accidental execution against production resources.
 */
function validateDatabaseUrl(supabaseUrl: string, serviceRoleKey: string) {
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "❌ ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing during E2E setup.",
    );
    process.exit(1);
  }

  const { hostname } = new URL(supabaseUrl);
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

  if (!isLocalHost) {
    console.error(
      `❌ ERROR: Refusing to seed a non-local database. SUPABASE_URL hostname is '${hostname}'.`,
    );
    process.exit(1);
  }
}

/**
 * Busts the Next.js cache so the application serves the freshly-seeded database state
 * rather than the stale state cached when `next build` previously ran.
 */
async function bustNextCache() {
  const revalidateSecret =
    process.env.REVALIDATE_SECRET || process.env.REVALIDATION_SECRET;
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

  if (!revalidateSecret) {
    console.warn(
      "⚠️ REVALIDATION_SECRET missing in E2E setup, Next.js cache might be stale.",
    );
    return;
  }

  console.log(`▶ Revalidating Next.js job cache at ${baseUrl}...`);

  try {
    const res = await fetch(`${baseUrl}/api/revalidate-jobs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${revalidateSecret}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Cache revalidation failed with status ${res.status}: ${errorText}`,
      );
    }

    console.log("✅ E2E Global Setup: Next.js cache revalidated.");
  } catch (err) {
    throw new Error(
      `Failed to reach Next.js cache endpoint at ${baseUrl}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Playwright Global Setup
 * Runs once before all tests to prepare the environment and seed the database.
 */
async function globalSetup() {
  console.log("▶ E2E Global Setup: Initializing test environment...");

  try {
    loadEnvironmentVariables();

    const supabaseUrl = process.env.SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

    validateDatabaseUrl(supabaseUrl, serviceRoleKey);

    console.log(`▶ Seeding test database: ${supabaseUrl}`);
    await resetAndSeedDatabase({
      supabaseUrl,
      serviceRoleKey,
      projectRef: "localhost",
    });
    console.log("✅ E2E Global Setup: Database seeded successfully.");

    await bustNextCache();
  } catch (error) {
    console.error("❌ E2E Global Setup: Failed to prepare environment:", error);
    process.exit(1);
  }
}

export default globalSetup;
