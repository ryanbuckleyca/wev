require('dotenv').config({ path: require('path').resolve(__dirname, '../../wev-scraper/.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Use local development database for restore
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://monvruedailbkcekicbl.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || '<YOUR_SERVICE_ROLE_KEY>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

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

  // Clear existing data - use a safer approach
  try {
    // First try to delete all data
    const { error: deleteError } = await supabase.from(table).delete().gte('id', '00000000-0000-0000-0000-000000000000');
    if (deleteError) {
      console.log(`Warning: Could not clear ${schema}.${table}: ${deleteError.message}`);
    }
  } catch (e) {
    console.log(`Warning: Could not clear ${schema}.${table}: ${e.message}`);
  }

  // Insert backup data in smaller batches to avoid issues
  const batchSize = 10;
  for (let i = 0; i < backupData.length; i += batchSize) {
    const batch = backupData.slice(i, i + batchSize);
    const { data, error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`Error restoring batch ${schema}.${table}:`, error.message);
      // Try individual inserts for problematic data
      for (const row of batch) {
        const { data: singleData, error: singleError } = await supabase.from(table).insert(row);
        if (singleError) {
          console.error(`Error inserting single row in ${schema}.${table}:`, singleError.message, row);
        }
      }
    } else {
      console.log(`Restored batch ${i/batchSize + 1}/${Math.ceil(backupData.length/batchSize)} for ${schema}.${table}`);
    }
  }

  console.log(`✅ Restored ${schema}.${table} (${backupData.length} rows total)`);
}

(async () => {
  const backupDir = path.resolve(__dirname, 'backups');
  const backupFiles = fs.readdirSync(backupDir).filter(f => f.startsWith('backup_') && f.endsWith('.json'));
  
  console.log(`Found ${backupFiles.length} backup files to restore...`);
  
  // Define restore order to handle foreign key constraints
  const restoreOrder = [
    'organizations',
    'sources', 
    'user_roles',
    'profiles',
    'jobs',
    'scrape_runs'
  ];
  
  for (const table of restoreOrder) {
    const backupFile = `backup_public_${table}.json`;
    if (backupFiles.includes(backupFile)) {
      await restoreTable(table, 'public');
    }
  }
  
  console.log('Restore complete.');
})();
