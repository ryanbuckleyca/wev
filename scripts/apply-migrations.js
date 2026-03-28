#!/usr/bin/env node
/**
 * Apply pending migrations to Supabase database.
 * Uses service role key to execute SQL directly.
 */

require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const MIGRATIONS_DIR = path.join(__dirname, '../supabase/migrations')

// Migrations to apply in order
const MIGRATIONS = [
  '20260307170000_esco_skills_bilingual_reset.sql',
  '20260306161200_profiles_skills_max_10.sql',
  '20260307180000_jobs_skills_and_extended_matching.sql',
  '20260325000000_add_rated_columns.sql',
  '20260328000000_job_confidence_in_matching.sql',
  '20260328120000_grant_recalculate_match_rpcs.sql',
]

async function applyMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename)
  
  if (!fs.existsSync(filepath)) {
    console.log(`⚠️  Skipping ${filename} (file not found)`)
    return false
  }

  const sql = fs.readFileSync(filepath, 'utf8')
  
  console.log(`\n📝 Applying migration: ${filename}`)
  console.log(`   File: ${filepath}`)
  
  try {
    // Execute SQL using Supabase REST API
    const { error } = await supabase.rpc('exec_sql', { sql_string: sql })
    
    if (error) {
      // If exec_sql function doesn't exist, try alternative approach
      if (error.message.includes('exec_sql')) {
        console.log('   ⚠️  exec_sql function not available, trying alternative method...')
        
        // Split SQL into statements and execute one by one
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'))
        
        for (const statement of statements) {
          if (statement.length === 0) continue
          
          const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: statement + ';' })
          })
          
          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`HTTP ${response.status}: ${errorText}`)
          }
        }
        
        console.log(`   ✅ Applied successfully (alternative method)`)
        return true
      }
      
      throw error
    }
    
    console.log(`   ✅ Applied successfully`)
    return true
  } catch (err) {
    console.error(`   ❌ Error applying migration:`)
    console.error(`      ${err.message}`)
    return false
  }
}

async function main() {
  console.log('🚀 Starting migration application...')
  console.log(`   Database: ${SUPABASE_URL}`)
  console.log(`   Migrations directory: ${MIGRATIONS_DIR}`)
  
  let successCount = 0
  let failCount = 0
  
  for (const migration of MIGRATIONS) {
    const success = await applyMigration(migration)
    if (success) {
      successCount++
    } else {
      failCount++
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log(`✅ Successful: ${successCount}`)
  console.log(`❌ Failed: ${failCount}`)
  console.log('='.repeat(60))
  
  if (failCount > 0) {
    console.log('\n⚠️  Some migrations failed. You may need to apply them manually via Supabase Dashboard.')
    console.log('   Dashboard SQL Editor: https://supabase.com/dashboard/project/monvruedailbkcekicbl/sql')
    process.exit(1)
  }
  
  console.log('\n✨ All migrations applied successfully!')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
