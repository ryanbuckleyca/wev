import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import { resetAndSeedTestDatabase } from './test-database';
import {
  getE2ETestDatabaseConfig,
  getWebServerEnv,
  loadPlaywrightEnv,
  PLAYWRIGHT_PORT,
  PLAYWRIGHT_BASE_URL,
} from './test-env';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function createCommandEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...getWebServerEnv(),
  };
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function startCommand(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const child = spawn(command, args, {
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  // Filter out Supabase getSession warnings
  const filterSupabaseWarnings = (data: Buffer) => {
    const text = data.toString();
    if (!text.includes('Using the user object as returned from supabase.auth.getSession()')) {
      process.stdout.write(data);
    }
  };

  child.stdout?.on('data', filterSupabaseWarnings);
  child.stderr?.on('data', filterSupabaseWarnings);

  const forwardSignal = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };

  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

async function main(): Promise<void> {
  loadPlaywrightEnv();

  const env = createCommandEnv();
  
  // Clear Next.js cache to ensure fresh build with test config
  const nextCachePath = path.resolve(process.cwd(), '.next');
  if (fs.existsSync(nextCachePath)) {
    fs.rmSync(nextCachePath, { recursive: true, force: true });
    console.log('Cleared .next cache');
  }
  
  // Temporarily rename .env.production to prevent it from being loaded
  // This is necessary because Next.js loads .env.production during build
  // even when NODE_ENV=test
  const envProductionPath = path.resolve(process.cwd(), '.env.production');
  const envProductionBackupPath = path.resolve(process.cwd(), '.env.production.backup');
  let productionEnvRenamed = false;
  
  if (fs.existsSync(envProductionPath)) {
    fs.renameSync(envProductionPath, envProductionBackupPath);
    productionEnvRenamed = true;
    console.log('Temporarily renamed .env.production to .env.production.backup');
  }
  
  try {
    // Create .env.test.local which has highest priority in Next.js env loading
    // Next.js loads env files in this order (highest to lowest priority):
    // 1. .env.$(NODE_ENV).local  <-- We use this
    // 2. .env.local (not loaded when NODE_ENV is test)
    // 3. .env.$(NODE_ENV)
    // 4. .env
    const testEnvPath = path.resolve(process.cwd(), '.env.test.local');
    const testConfig = getE2ETestDatabaseConfig();
    const testEnvContent = `# Auto-generated for e2e tests - DO NOT COMMIT
NEXT_PUBLIC_SUPABASE_URL=${testConfig.supabaseUrl}
NEXT_PUBLIC_SITE_URL=${PLAYWRIGHT_BASE_URL}
`;
    
    fs.writeFileSync(testEnvPath, testEnvContent);
    console.log('Created .env.test.local with test database configuration');

    await resetAndSeedTestDatabase(testConfig);
    await runCommand(npmCommand, ['run', 'build'], env);
    
    // DON'T restore .env.production yet - keep it renamed so the server uses .env.test.local
    // The server will load .env.test.local because it has higher priority than .env
  } catch (error) {
    // Restore .env.production on error
    if (productionEnvRenamed && fs.existsSync(envProductionBackupPath)) {
      fs.renameSync(envProductionBackupPath, envProductionPath);
    }
    throw error;
  }
  
  // Start the server - it will use .env.test.local since .env.production is still renamed
  startCommand(npmCommand, ['run', 'start', '--', '--port', String(PLAYWRIGHT_PORT)], env);
  
  // Note: .env.production stays renamed during test execution
  // It will be restored when the process exits or you can manually restore it
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
