import { resetAndSeedDatabase } from "./src/seeder";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";
import { config as loadEnv } from "dotenv";

/**
 * Standalone script to seed the STAGING database (wev-test).
 *
 * Usage from repo root:
 * npx tsx supabase/seed-staging.ts
 */

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log("▶ Loading Staging environment variables...");

  // Explicitly load .env.staging from root
  const envPath = path.join(process.cwd(), ".env.staging");

  if (!fs.existsSync(envPath)) {
    console.error(`❌ Error: Staging environment file not found at ${envPath}`);
    process.exit(1);
  }

  loadEnv({ path: envPath });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = process.env.SUPABASE_PROJECT_REF;

  // Prod credentials for syncing
  const prodUrl = process.env.SUPABASE_PROD_URL;
  const prodKey = process.env.SUPABASE_PROD_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !projectRef || !prodUrl || !prodKey) {
    console.error(
      "❌ Error: Missing staging or production credentials in .env.staging",
    );
    process.exit(1);
  }

  console.log("\n" + "!".repeat(40));
  console.log("⚠️  STAGING SYNC: MIRRORING PRODUCTION");
  console.log(`TARGET: ${projectRef} (${supabaseUrl})`);
  console.log(`SOURCE: PRODUCTION (${prodUrl})`);
  console.log("!".repeat(40) + "\n");

  const isForce = process.argv.includes("--force");

  if (!isForce) {
    if (!process.stdout.isTTY) {
      console.error(
        "❌ Error: Staging seed requires an interactive terminal. Use --force flag to bypass in CI.",
      );
      process.exit(1);
    }

    // Confirm before any async work; rl is created and closed inside prompt()
    const answer = await prompt(
      'This will delete all existing data in STAGING and replace it with a production-mirror.\nType "YES" to confirm: ',
    );
    if (answer !== "YES") {
      console.log("Aborting.");
      process.exit(0);
    }
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");

    // 1. Fetch live sources from Production
    console.log("▶ Fetching authentic sources from Production...");
    const prodClient = createClient(prodUrl, prodKey, {
      auth: { persistSession: false },
    });
    const { data: prodSources, error: fetchError } = await prodClient
      .from("sources")
      .select("*");

    if (fetchError || !prodSources) {
      throw new Error(
        `Failed to fetch production sources: ${fetchError?.message}`,
      );
    }

    console.log(`✅ Found ${prodSources.length} production sources.`);

    // 2. Seed Staging using production source overrides
    console.log(`▶ Seeding staging project: ${projectRef}`);
    await resetAndSeedDatabase(
      { projectRef, serviceRoleKey, supabaseUrl },
      prodSources,
    );

    console.log("✅ Staging database synced with Production successfully.");
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Seeding failed: ${message}`);
    process.exit(1);
  }
}

main();
