import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

function execVerbose(command: string) {
  const result = spawnSync(command, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function loadProjectRef(target: string) {
  if (target === 'prod' && fs.existsSync('.env.production')) {
    loadEnv({ path: '.env.production', override: true });
  }

  if (target === 'staging' && fs.existsSync('.env.staging')) {
    loadEnv({ path: '.env.staging', override: true });
  }

  let projectRef = process.env.SUPABASE_PROJECT_REF;

  if (!projectRef && process.env.SUPABASE_URL) {
    try {
      const urlObj = new URL(process.env.SUPABASE_URL);
      const hostParts = urlObj.hostname.split('.');
      if (hostParts.length > 0) {
        projectRef = hostParts[0];
      }
    } catch {
      // ignore
    }
  }

  if (!projectRef) {
    console.error(`✗ Error: SUPABASE_PROJECT_REF not set for ${target}, and it could not be derived from SUPABASE_URL`);
    process.exit(1);
  }

  console.log(`✓ Using project reference: ${projectRef}`);
  return projectRef;
}

function runMigration(target: string, dryRun: boolean) {
  const projectRef = loadProjectRef(target);

  console.log(`▶ Linking to project: ${projectRef}`);
  execVerbose(`supabase link --project-ref "${projectRef}"`);

  console.log(`▶ Syncing migration history (fetching any missing files from remote)...`);
  try {
    execSync('supabase migration fetch --linked', { stdio: 'pipe' });
  } catch (e) {
    console.log('ℹ️  No remote-only migrations found or fetch failed.');
  }

  let dbPushCmd = 'supabase db push --yes';
  if (dryRun) dbPushCmd += ' --dry-run';
  if (process.env.SUPABASE_DB_PASSWORD) {
    dbPushCmd += ` -p "${process.env.SUPABASE_DB_PASSWORD}"`;
  }

  console.log(`▶ Pushing local migrations...`);
  const pushRes = spawnSync(dbPushCmd, { shell: true, stdio: 'inherit' });
  if (pushRes.status !== 0) {
    console.error("❌ Push failed. If you see hash mismatches, you may need to 'git pull' first.");
    process.exit(1);
  } else {
    console.log("✅ Success!");
  }

  if (!dryRun) {
    console.log("▶ Regenerating Supabase TypeScript types...");
    execVerbose('npx tsx supabase/generate-types.ts ' + target);
  }
}

function main() {
  const envPath = fs.existsSync('.env') ? '.env' : path.join('..', '.env');
  loadEnv({ path: envPath });

  const target = process.argv[2];
  const dryRun = process.env.MIGRATE_DRY_RUN === '1';

  if (!target) {
    console.error("Usage: tsx supabase/migrate.ts <local|staging|prod>");
    process.exit(1);
  }

  if (target === 'local') {
    console.log("▶ Resetting local database...");
    execVerbose('supabase db reset');
    
    console.log("▶ Seeding database with E2E dataset...");
    execVerbose('npx tsx supabase/seed-local.ts');
    
    console.log("▶ Regenerating TypeScript types...");
    execVerbose('npx tsx supabase/generate-types.ts local');
    
    console.log("✨ Done.");
  } else if (target === 'staging' || target === 'prod') {
    console.log(`▶ Starting migration for ${target}...`);
    runMigration(target, dryRun);
    console.log("✨ Done.");
  } else {
    console.error(`✗ Unsupported target: ${target}`);
    process.exit(1);
  }
}

main();
