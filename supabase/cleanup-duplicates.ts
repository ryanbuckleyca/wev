import readline from "node:readline";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { findRepoRoot, loadProductionEnvOnly } from "../scripts/parse-env";
import {
  getSupabaseScriptConfig,
  PROD_SCRIPT_CONFIG,
} from "./src/script-config";

function parseArgs(argv: string[]) {
  return {
    prod: argv.includes("--prod"),
  };
}

async function confirmProductionRun() {
  if (process.env.CONFIRM_PROD_RUN === "YES") {
    console.log("🔥 Using PRODUCTION database (confirmation skipped)");
    return;
  }

  if (!process.stdin.isTTY) {
    console.error(
      "Refusing to run against production in non-interactive mode. Set CONFIRM_PROD_RUN=YES to override.",
    );
    process.exit(1);
  }

  console.log(
    "\nWARNING: You are about to run against the PRODUCTION database.",
  );
  console.log("This will delete real duplicate records.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const response = await new Promise<string>((resolve) => {
      rl.question("Type YES to continue, anything else to abort: ", resolve);
    });

    if (response.trim() !== "YES") {
      console.log("Aborted.");
      process.exit(1);
    }
  } finally {
    rl.close();
  }

  console.log("🔥 Using PRODUCTION database");
}

function createSupabaseClient({ prod }: { prod: boolean }) {
  if (prod) {
    loadProductionEnvOnly(findRepoRoot());
  }

  const { url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY } =
    getSupabaseScriptConfig(
      "cleanup-duplicates.ts",
      prod
        ? PROD_SCRIPT_CONFIG
        : {
            urlEnv: "SUPABASE_URL",
            keyEnvNames: ["SUPABASE_SERVICE_ROLE_KEY"],
            keyDescription: "local service role key",
          },
    );

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function cleanupDuplicates(
  supabase: SupabaseClient<any>,
  tableName: string,
  uniqueField: string,
) {
  console.log(`🧹 Cleaning duplicates in ${tableName}...`);

  const orderBy = tableName === "jobs" ? "scraped_at" : "created_at";

  const { data: allRecords, error } = await supabase
    .from(tableName)
    .select("*")
    .order(orderBy, { ascending: true });

  if (error) {
    console.error(`Error fetching ${tableName}:`, error.message);
    return;
  }

  if (!allRecords || allRecords.length === 0) {
    console.log(`No records found in ${tableName}`);
    return;
  }

  const seen = new Set();
  const duplicates: string[] = [];

  for (const record of allRecords) {
    const key = record[uniqueField];
    if (seen.has(key)) {
      duplicates.push(record.id);
    } else {
      seen.add(key);
    }
  }

  if (duplicates.length === 0) {
    console.log(`✅ No duplicates found in ${tableName}`);
    return;
  }

  console.log(
    `Found ${duplicates.length} duplicates in ${tableName}, removing...`,
  );

  const batchSize = 10;
  for (let i = 0; i < duplicates.length; i += batchSize) {
    const batch = duplicates.slice(i, i + batchSize);
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .in("id", batch);

    if (deleteError) {
      console.error(
        `Error deleting batch ${i / batchSize + 1}:`,
        deleteError.message,
      );
    } else {
      console.log(
        `Deleted batch ${i / batchSize + 1}/${Math.ceil(duplicates.length / batchSize)}`,
      );
    }
  }

  console.log(`✅ Removed ${duplicates.length} duplicates from ${tableName}`);
}

async function cleanupAll(
  supabase: SupabaseClient<any>,
  { prod }: { prod: boolean },
) {
  console.log("🚀 Starting duplicate cleanup...\n");
  console.log(
    prod ? "🔥 Target: production database\n" : "🧪 Target: local database\n",
  );

  await cleanupDuplicates(supabase, "jobs", "listing_url");
  await cleanupDuplicates(supabase, "sources", "url");

  console.log("\n✨ Cleanup complete!");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.prod) {
    await confirmProductionRun();
  }

  const supabase = createSupabaseClient(args);
  await cleanupAll(supabase, args);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
