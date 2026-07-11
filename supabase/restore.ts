import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseScriptConfig } from "./src/script-config";
import {
  IDENTITY_RESET_SQL,
  RESTORE_CLEAR_ORDER,
  RESTORE_IDENTITY_TABLES,
  RESTORE_INSERT_ORDER,
  sanitizeBackupRow,
  TABLE_CLEAR_COLUMN,
  TABLE_UPSERT_CONFLICT,
  type RestoreIdentityTable,
} from "./src/backup-row";
import {
  envHelpLines,
  loadEnvFiles,
  parseEnvFlag,
  type TargetEnv,
} from "../scripts/parse-env";

const execFileAsync = promisify(execFile);

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

function backupFilePath(table: string, schema = "public") {
  return path.resolve(__dirname, "backups", `backup_${schema}_${table}.json`);
}

function hasBackup(table: string, backupFiles: Set<string>) {
  return backupFiles.has(`backup_public_${table}.json`);
}

async function clearTable(supabase: SupabaseClient, table: string) {
  const column = TABLE_CLEAR_COLUMN[table] ?? "id";
  try {
    // PostgREST requires a filter; clear both non-null and null values so
    // nullable clear-columns (e.g. bookmarks.job_id) don't leave orphan rows.
    const { error: nonNullError } = await supabase
      .from(table)
      .delete()
      .not(column, "is", null);
    if (nonNullError) {
      console.log(`Warning: Could not clear ${table}: ${nonNullError.message}`);
      return false;
    }

    const { error: nullError } = await supabase
      .from(table)
      .delete()
      .is(column, null);
    if (nullError) {
      console.log(
        `Warning: Could not clear null-${column} rows in ${table}: ${nullError.message}`,
      );
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

function isRestoreIdentityTable(table: string): table is RestoreIdentityTable {
  return (RESTORE_IDENTITY_TABLES as readonly string[]).includes(table);
}

function buildIdentityResetSql(tables: readonly string[]): string {
  return tables
    .map((table) => {
      if (!isRestoreIdentityTable(table)) {
        throw new Error(`Identity reset not allowlisted for table: ${table}`);
      }
      return IDENTITY_RESET_SQL[table];
    })
    .join("\n");
}

async function runSql(sql: string, env: TargetEnv): Promise<void> {
  const dbUrl =
    process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();

  if (dbUrl) {
    await execFileAsync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
      maxBuffer: 10 * 1024 * 1024,
    });
    return;
  }

  if (env === "local") {
    await execFileAsync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_wev",
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    return;
  }

  throw new Error(
    "Set SUPABASE_DB_URL (or DATABASE_URL) to reset identity sequences after restore.",
  );
}

async function resetIdentitySequences(
  tables: readonly string[],
  env: TargetEnv,
): Promise<void> {
  if (tables.length === 0) return;

  try {
    await runSql(buildIdentityResetSql(tables), env);
    console.log(`✅ Reset identity sequences for: ${tables.join(", ")}`);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(
      `Warning: Could not reset identity sequences (${tables.join(", ")}): ${message}`,
    );
    console.log(
      "  New inserts may fail with duplicate key until you run e.g.:",
    );
    console.log(
      "  SELECT setval(pg_get_serial_sequence('public.organizations','id'), (SELECT MAX(id) FROM organizations));",
    );
  }
}

async function restoreTable(supabase: SupabaseClient, table: string) {
  const backupFile = backupFilePath(table);

  if (!fs.existsSync(backupFile)) {
    console.log(`No backup file found for public.${table}, skipping...`);
    return;
  }

  const backupData = JSON.parse(fs.readFileSync(backupFile, "utf8"));

  if (!Array.isArray(backupData) || backupData.length === 0) {
    console.log(`No data to restore for public.${table}, skipping...`);
    return;
  }

  const sanitizedData = backupData.map((row: Record<string, unknown>) =>
    sanitizeBackupRow(row),
  );

  const batchSize = 50;
  const onConflict = TABLE_UPSERT_CONFLICT[table];
  let successCount = 0;

  for (let i = 0; i < sanitizedData.length; i += batchSize) {
    const batch = sanitizedData.slice(i, i + batchSize);
    const query = onConflict
      ? supabase.from(table).upsert(batch, { onConflict })
      : supabase.from(table).insert(batch);
    const { error } = await query;

    if (error) {
      console.error(
        `Error restoring batch ${i / batchSize + 1} for public.${table}:`,
        error.message,
      );
      for (const row of batch) {
        const singleQuery = onConflict
          ? supabase.from(table).upsert(row, { onConflict })
          : supabase.from(table).insert(row);
        const { error: singleError } = await singleQuery;
        if (!singleError) {
          successCount++;
        } else {
          console.error(
            `Error inserting single row in public.${table}:`,
            singleError.message,
          );
        }
      }
    } else {
      successCount += batch.length;
      console.log(
        `Restored batch ${i / batchSize + 1}/${Math.ceil(
          sanitizedData.length / batchSize,
        )} for public.${table}`,
      );
    }
  }

  console.log(
    `✅ Restored ${successCount}/${sanitizedData.length} rows for public.${table}`,
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

  const backupFiles = new Set(
    fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("backup_") && f.endsWith(".json")),
  );

  console.log(`Found ${backupFiles.size} backup files to restore to ${env}...`);

  // Local sync must not wipe the developer's auth-linked profile (skills/values).
  const skipLocalIdentity = env === "local";
  const localIdentityTables = new Set(["profiles", "user_roles"]);

  if (skipLocalIdentity) {
    console.log(
      "Preserving local profiles and user_roles (skills, values, and roles stay intact).",
    );
  }

  console.log("Clearing target tables...");
  for (const table of RESTORE_CLEAR_ORDER) {
    if (skipLocalIdentity && localIdentityTables.has(table)) continue;
    if (hasBackup(table, backupFiles)) {
      await clearTable(supabase, table);
    }
  }

  for (const table of RESTORE_INSERT_ORDER) {
    if (skipLocalIdentity && localIdentityTables.has(table)) continue;
    if (hasBackup(table, backupFiles)) {
      await restoreTable(supabase, table);
    }
  }

  const identityTables = RESTORE_IDENTITY_TABLES.filter((table) =>
    hasBackup(table, backupFiles),
  );
  if (identityTables.length > 0) {
    await resetIdentitySequences(identityTables, env);
  }

  if (!hasBackup("esco_skills", backupFiles)) {
    console.log("ℹ️  No esco_skills backup found. Populate skills with:");
    console.log("    npm run skills:index -- --upsert-db");
    console.log(
      "    npm run skills:embeddings   # only if embeddings are missing",
    );
  }

  console.log("Restore complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
