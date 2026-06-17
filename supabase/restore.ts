import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseScriptConfig } from "./src/script-config";
import {
  envHelpLines,
  loadEnvFiles,
  parseEnvFlag,
  type TargetEnv,
} from "../scripts/parse-env";

function parseRestoreArgs(argv: string[]) {
  const args = argv.filter((a) => a !== "--");
  if (args.includes("--help") || args.includes("-h")) {
    console.error(envHelpLines("restore", ["local", "staging"]));
    process.exit(0);
  }
  const env = parseEnvFlag(args, {
    allow: ["local", "staging"],
    defaultEnv: "local",
  }) as TargetEnv;
  if (env === "prod") {
    console.error("Error: restore does not support --env prod");
    process.exit(1);
  }
  return env;
}

async function clearTable(supabase: SupabaseClient, table: string) {
  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .gte("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.log(`Warning: Could not clear ${table}: ${error.message}`);
      return false;
    }
    console.log(`✅ Cleared ${table}`);
    return true;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`Warning: Could not clear ${table}: ${message}`);
    return false;
  }
}

async function restoreTable(
  supabase: SupabaseClient,
  table: string,
  schema: string = "public",
) {
  const backupFile = path.resolve(
    __dirname,
    "backups",
    `backup_${schema}_${table}.json`,
  );

  if (!fs.existsSync(backupFile)) {
    console.log(`No backup file found for ${schema}.${table}, skipping...`);
    return;
  }

  const backupData = JSON.parse(fs.readFileSync(backupFile, "utf8"));

  if (backupData.length === 0) {
    console.log(`No data to restore for ${schema}.${table}, skipping...`);
    return;
  }

  const cleared = await clearTable(supabase, table);
  if (!cleared) {
    console.log(`⚠️  Could not clear ${table}, attempting to insert anyway...`);
  }

  const droppedColumns = ["ideal_work_environment"];
  const sanitizedData = backupData.map((row: Record<string, unknown>) => {
    const clean = { ...row };
    for (const col of droppedColumns) delete clean[col];
    return clean;
  });

  const batchSize = 10;
  let successCount = 0;

  for (let i = 0; i < sanitizedData.length; i += batchSize) {
    const batch = sanitizedData.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(
        `Error restoring batch ${i / batchSize + 1} for ${schema}.${table}:`,
        error.message,
      );
      for (const row of batch) {
        const { error: singleError } = await supabase.from(table).insert(row);
        if (!singleError) {
          successCount++;
        } else {
          console.error(
            `Error inserting single row in ${schema}.${table}:`,
            singleError.message,
          );
        }
      }
    } else {
      successCount += batch.length;
      console.log(
        `Restored batch ${i / batchSize + 1}/${Math.ceil(
          sanitizedData.length / batchSize,
        )} for ${schema}.${table}`,
      );
    }
  }

  console.log(
    `✅ Restored ${successCount}/${sanitizedData.length} rows for ${schema}.${table}`,
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const env = parseRestoreArgs(argv);
  loadEnvFiles(env);

  const { url: supabaseUrl, serviceRoleKey } = getSupabaseScriptConfig(
    "restore.ts",
    {
      urlEnv: "SUPABASE_URL",
      keyEnvNames: ["SUPABASE_SERVICE_ROLE_KEY"],
      keyDescription: `${env} service role key`,
    },
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const backupDir = path.resolve(__dirname, "backups");
  if (!fs.existsSync(backupDir)) {
    console.error("Backups directory not found.");
    process.exit(1);
  }

  const backupFiles = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("backup_") && f.endsWith(".json"));

  console.log(
    `Found ${backupFiles.length} backup files to restore to ${env}...`,
  );

  const restoreOrder = [
    "organizations",
    "sources",
    "user_roles",
    "profiles",
    "jobs",
    "scrape_runs",
  ];

  for (const table of restoreOrder) {
    const backupFile = `backup_public_${table}.json`;
    if (backupFiles.includes(backupFile)) {
      await restoreTable(supabase, table, "public");
    }
  }

  console.log("Restore complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
