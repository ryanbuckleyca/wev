import fs from "node:fs";
import path from "node:path";

const typesPath = path.resolve(__dirname, "..", "src", "database.types.ts");
const backupsDir = path.resolve(__dirname, "..", "backups");

if (!fs.existsSync(typesPath)) {
  console.error(
    "database.types.ts not found; run `npm run types:supabase` first.",
  );
  process.exit(2);
}

const text = fs.readFileSync(typesPath, "utf8");

function parseInsertKeys(table: string) {
  // Regex to find the `Insert` block for a table like `bookmarks: { ... Insert: { ... } ... }`
  const re = new RegExp(
    `${table}\\s*:\\s*{[\\s\\S]*?Insert\\s*:\\s*{([\\s\\S]*?)}`,
    "m",
  );
  const m = text.match(re);
  if (!m) return null;
  const block = m[1];
  const keys: { name: string; optional: boolean }[] = [];
  const keyRe = /^\s*([a-zA-Z0-9_]+)(\?)?\s*:\s*/gm;
  let km;
  while ((km = keyRe.exec(block)) !== null) {
    keys.push({ name: km[1], optional: !!km[2] });
  }
  return keys;
}

if (!fs.existsSync(backupsDir)) {
  console.error("Backups directory not found.");
  process.exit(2);
}

const backupFiles = fs
  .readdirSync(backupsDir)
  .filter((f) => f.startsWith("backup_") && f.endsWith(".json"));

const generatedAllowlist = [
  /^fts(?:_[a-z]{2,})?$/i,
  /_fts$/i,
  /search_vector$/i,
  /^has_compensation$/i,
  /^ideal_work_environment$/i,
];

let failed = false;

for (const file of backupFiles) {
  const m = file.match(/^backup_([^_]+)_(.+)\.json$/);
  if (!m) continue;
  const schema = m[1];
  const table = m[2];

  const insertKeys = parseInsertKeys(table);
  if (!insertKeys) {
    console.warn(
      `Could not find table ${table} in database.types.ts; skipping file ${file}`,
    );
    continue;
  }

  const allowed = new Set(insertKeys.map((k) => k.name));
  const required = insertKeys.filter((k) => !k.optional).map((k) => k.name);

  const data = JSON.parse(
    fs.readFileSync(path.resolve(backupsDir, file), "utf8"),
  );
  if (!Array.isArray(data) || data.length === 0) continue;

  const keysInBackup = new Set<string>();
  for (const row of data)
    Object.keys(row || {}).forEach((k) => keysInBackup.add(k));

  const extra = Array.from(keysInBackup).filter(
    (k) => !allowed.has(k) && !generatedAllowlist.some((rx) => rx.test(k)),
  );
  if (extra.length > 0) {
    console.error(
      `${file}: contains non-insertable columns: ${extra.join(", ")}`,
    );
    failed = true;
  }

  const missing = required.filter((k) => !keysInBackup.has(k));
  if (missing.length > 0) {
    console.error(
      `${file}: missing required insert columns: ${missing.join(", ")}`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("Backups schema check passed.");
