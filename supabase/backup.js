require('dotenv').config({ path: require('path').resolve(__dirname, '../../wev-scraper/.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Use production database for backup
const SUPABASE_URL = process.env.SUPABASE_PROD_URL || 'https://teuvfoftdjfsnkkbnzps.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_PROD_SECRET_KEY || '<YOUR_SERVICE_ROLE_KEY>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Dynamically extract table names from all migration .sql files
function getAllMigrationFiles(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => path.join(migrationsDir, f));
}

function extractTablesFromSql(sql) {
  const createRegex = /CREATE TABLE IF NOT EXISTS\s+"([^"]+)"\."([^"]+)"/g;
  const dropRegex = /DROP TABLE IF EXISTS\s+"([^"]+)"\."([^"]+)"/g;
  const events = [];
  let match;
  while ((match = createRegex.exec(sql)) !== null) {
    events.push({ type: 'create', schema: match[1], table: match[2] });
  }
  while ((match = dropRegex.exec(sql)) !== null) {
    events.push({ type: 'drop', schema: match[1], table: match[2] });
  }
  return events;
}

function getAllTablesFromMigrations(migrationsDir) {
  const files = getAllMigrationFiles(migrationsDir);
  const tableMap = new Map();
  for (const file of files) {
    const sql = fs.readFileSync(file, 'utf8');
    for (const event of extractTablesFromSql(sql)) {
      const key = `${event.schema}.${event.table}`;
      if (event.type === 'create') {
        tableMap.set(key, { schema: event.schema, table: event.table });
      } else if (event.type === 'drop') {
        tableMap.delete(key);
      }
    }
  }
  // Migrations also use `CREATE TABLE name` / `CREATE TABLE public.name` (no quoted schema.table).
  // Those are not matched above; merge known public tables so backups stay complete.
  const extraPublic = ['job_matches', 'bookmarks', 'job_skills', 'esco_skills'];
  for (const table of extraPublic) {
    const key = `public.${table}`;
    if (!tableMap.has(key)) tableMap.set(key, { schema: 'public', table });
  }
  return Array.from(tableMap.values());
}

const PAGE = 1000;

async function backupTable(table, schema = 'public') {
  // Use only schema.table for Supabase REST API
  const tableRef = `${schema === 'public' ? table : schema + '.' + table}`;
  const data = [];
  for (let from = 0; ; from += PAGE) {
    const { data: chunk, error } = await supabase
      .from(tableRef)
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`Error backing up ${tableRef}:`, error.message);
      return;
    }
    if (!chunk?.length) break;
    data.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  // Ensure backups directory exists
  const backupDir = path.resolve(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(backupDir, `backup_${schema}_${table}.json`),
    JSON.stringify(data, null, 2),
  );
  console.log(`Backed up ${tableRef} (${data.length} rows)`);
}

// Adjust path: migrations are at ./migrations
(async () => {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  let allTables = getAllTablesFromMigrations(migrationsDir);
  // Always include auth.users and auth.identities
  // auth.* is not exposed to PostgREST; .from('auth.users') fails — export users from the dashboard if needed (see backup.md).
  for (const { schema, table } of allTables) {
    await backupTable(table, schema);
  }
  console.log('Backup complete.');
})();
