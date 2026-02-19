require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://teuvfoftdjfsnkkbnzps.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '<YOUR_SERVICE_ROLE_KEY>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});



// Dynamically extract table names from all migration .sql files
function getAllMigrationFiles(migrationsDir) {
  return fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => path.join(migrationsDir, f));
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
  return Array.from(tableMap.values());
}

async function backupTable(table, schema = 'public') {
  // Use only schema.table for Supabase REST API
  const tableRef = `${schema === 'public' ? table : schema + '.' + table}`;
  const { data, error } = await supabase.from(tableRef).select('*');
  if (error) {
    console.error(`Error backing up ${tableRef}:`, error.message);
    return;
  }
  // Ensure backups directory exists
  const backupDir = path.resolve(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  fs.writeFileSync(path.join(backupDir, `backup_${schema}_${table}.json`), JSON.stringify(data, null, 2));
  console.log(`Backed up ${tableRef} (${data.length} rows)`);
}


// Adjust path: now running from supabase/backups/, migrations are at ../migrations
(async () => {
  const migrationsDir = path.resolve(__dirname, '../migrations');
  let allTables = getAllTablesFromMigrations(migrationsDir);
  // Always include auth.users and auth.identities
  const mustHave = [
    { schema: 'auth', table: 'users' },
    { schema: 'auth', table: 'identities' }
  ];
  for (const t of mustHave) {
    if (!allTables.some(x => x.schema === t.schema && x.table === t.table)) {
      allTables.push(t);
    }
  }
  for (const { schema, table } of allTables) {
    await backupTable(table, schema);
  }
  console.log('Backup complete.');
})();
