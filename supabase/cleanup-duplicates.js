require('dotenv').config({ path: require('path').resolve(__dirname, '../../wev-scraper/.env') });
const { createClient } = require('@supabase/supabase-js');

// Use local development database
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://monvruedailbkcekicbl.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || '<YOUR_SERVICE_ROLE_KEY>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function cleanupDuplicates(tableName, uniqueField) {
  console.log(`🧹 Cleaning duplicates in ${tableName}...`);
  
  // Get all records
  const { data: allRecords, error } = await supabase
    .from(tableName)
    .select('*')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error(`Error fetching ${tableName}:`, error.message);
    return;
  }
  
  if (!allRecords || allRecords.length === 0) {
    console.log(`No records found in ${tableName}`);
    return;
  }
  
  // Find duplicates based on unique field
  const seen = new Set();
  const duplicates = [];
  
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
  
  console.log(`Found ${duplicates.length} duplicates in ${tableName}, removing...`);
  
  // Delete duplicates in batches
  const batchSize = 10;
  for (let i = 0; i < duplicates.length; i += batchSize) {
    const batch = duplicates.slice(i, i + batchSize);
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .in('id', batch);
    
    if (deleteError) {
      console.error(`Error deleting batch ${i/batchSize + 1}:`, deleteError.message);
    } else {
      console.log(`Deleted batch ${i/batchSize + 1}/${Math.ceil(duplicates.length/batchSize)}`);
    }
  }
  
  console.log(`✅ Removed ${duplicates.length} duplicates from ${tableName}`);
}

async function cleanupAll() {
  console.log('🚀 Starting duplicate cleanup...\n');
  
  // Clean up tables that might have duplicates
  await cleanupDuplicates('jobs', 'job_title'); // Assuming job_title should be unique per scrape
  await cleanupDuplicates('organizations', 'name');
  await cleanupDuplicates('sources', 'url');
  
  console.log('\n✨ Cleanup complete!');
}

cleanupAll().catch(console.error);
