import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { findRepoRoot, loadProductionEnvOnly } from "../scripts/parse-env";
import {
  getSupabaseScriptConfig,
  PROD_SCRIPT_CONFIG,
} from "./src/script-config";

loadProductionEnvOnly(findRepoRoot());

const { url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY } =
  getSupabaseScriptConfig("backup.ts", PROD_SCRIPT_CONFIG);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function getAllMigrationFiles(migrationsDir: string) {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => path.join(migrationsDir, f));
}

function extractTablesFromSql(sql: string) {
  const createRegex = /CREATE TABLE IF NOT EXISTS\s+"([^"]+)"\."([^"]+)"/g;
  const dropRegex = /DROP TABLE IF EXISTS\s+"([^"]+)"\."([^"]+)"/g;
  const events: Array<{
    type: "create" | "drop";
    schema: string;
    table: string;
  }> = [];
  let match;
  while ((match = createRegex.exec(sql)) !== null) {
    events.push({ type: "create", schema: match[1], table: match[2] });
  }
  while ((match = dropRegex.exec(sql)) !== null) {
    events.push({ type: "drop", schema: match[1], table: match[2] });
  }
  return events;
}

function getAllTablesFromMigrations(migrationsDir: string) {
  const files = getAllMigrationFiles(migrationsDir);
  const tableMap = new Map<string, { schema: string; table: string }>();
  for (const file of files) {
    const sql = fs.readFileSync(file, "utf8");
    for (const event of extractTablesFromSql(sql)) {
      const key = `${event.schema}.${event.table}`;
      if (event.type === "create") {
        tableMap.set(key, { schema: event.schema, table: event.table });
      } else if (event.type === "drop") {
        tableMap.delete(key);
      }
    }
  }
  const extraPublic = ["job_matches", "bookmarks", "job_skills", "esco_skills"];
  for (const table of extraPublic) {
    const key = `public.${table}`;
    if (!tableMap.has(key)) tableMap.set(key, { schema: "public", table });
  }
  return Array.from(tableMap.values());
}

const PAGE = 1000;

async function backupTable(table: string, schema: string = "public") {
  const tableRef = `${schema === "public" ? table : schema + "." + table}`;
  const data: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: chunk, error } = await supabase
      .from(tableRef)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`Error backing up ${tableRef}:`, error.message);
      return;
    }
    if (!chunk?.length) break;
    data.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  const backupDir = path.resolve(__dirname, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(backupDir, `backup_${schema}_${table}.json`),
    JSON.stringify(data, null, 2),
  );
  console.log(`Backed up ${tableRef} (${data.length} rows)`);
}

(async () => {
  const migrationsDir = path.resolve(__dirname, "migrations");
  const allTables = getAllTablesFromMigrations(migrationsDir);
  for (const { schema, table } of allTables) {
    await backupTable(table, schema);
  }
  console.log("Backup complete.");
})();
