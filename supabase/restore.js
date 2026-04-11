const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getSupabaseScriptConfig } = require('./script-config');

const { url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseScriptConfig(
  'restore.js',
  {
    urlEnv: 'SUPABASE_URL',
    keyEnvNames: ['SUPABASE_SERVICE_ROLE_KEY'],
    keyDescription: 'local service role key',
  },
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function clearTable(table) {
  try {
    // Use TRUNCATE-like behavior by deleting all rows
    const { error } = await supabase
      .from(table)
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.log(`Warning: Could not clear ${table}: ${error.message}`);
      return false;
    }
    console.log(`✅ Cleared ${table}`);
    return true;
  } catch (e) {
    console.log(`Warning: Could not clear ${table}: ${e.message}`);
    return false;
  }
}

async function restoreTable(table, schema = 'public') {
  const backupFile = path.resolve(__dirname, 'backups', `backup_${schema}_${table}.json`);

  if (!fs.existsSync(backupFile)) {
    console.log(`No backup file found for ${schema}.${table}, skipping...`);
    return;
  }

  const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

  if (backupData.length === 0) {
    console.log(`No data to restore for ${schema}.${table}, skipping...`);
    return;
  }

  // Clear existing data first
  const cleared = await clearTable(table);
  if (!cleared) {
    console.log(`⚠️  Could not clear ${table}, attempting to insert anyway...`);
  }

  // Strip columns that no longer exist in the target schema.
  // IMPORTANT: Update this list whenever a column is dropped from the schema.
  // Columns dropped so far: ideal_work_environment (replaced by lat/lng/municipality/province)
  const droppedColumns = ['ideal_work_environment'];
  const sanitizedData = backupData.map((row) => {
    const clean = { ...row };
    for (const col of droppedColumns) delete clean[col];
    return clean;
  });

  // Insert backup data in smaller batches
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
      // Try individual inserts for problematic data
      for (const row of batch) {
        const { error: singleError } = await supabase.from(table).insert(row);
        if (!singleError) {
          successCount++;
        } else {
          console.error(`Error inserting single row in ${schema}.${table}:`, singleError.message);
        }
      }
    } else {
      successCount += batch.length;
      console.log(
        `Restored batch ${i / batchSize + 1}/${Math.ceil(sanitizedData.length / batchSize)} for ${schema}.${table}`,
      );
    }
  }

  console.log(`✅ Restored ${successCount}/${sanitizedData.length} rows for ${schema}.${table}`);
}

(async () => {
  const backupDir = path.resolve(__dirname, 'backups');
  const backupFiles = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('backup_') && f.endsWith('.json'));

  console.log(`Found ${backupFiles.length} backup files to restore...`);

  // Define restore order to handle foreign key constraints
  const restoreOrder = [
    'organizations',
    'sources',
    'user_roles',
    'profiles',
    'jobs',
    'scrape_runs',
  ];

  for (const table of restoreOrder) {
    const backupFile = `backup_public_${table}.json`;
    if (backupFiles.includes(backupFile)) {
      await restoreTable(table, 'public');
    }
  }

  console.log('Restore complete.');
})();
