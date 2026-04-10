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
  
  // Create a temporary .env.test file that Next.js will load instead of .env.production
  // Next.js loads env files in this order: .env.$(NODE_ENV).local, .env.local, .env.$(NODE_ENV), .env
  // Since we set NODE_ENV=test, it will load .env.test AFTER .env, giving us the override we need
  const testEnvPath = path.resolve(process.cwd(), '.env.test');
  const testConfig = getE2ETestDatabaseConfig();
  const testEnvContent = `# Auto-generated for e2e tests - DO NOT COMMIT
NEXT_PUBLIC_SUPABASE_URL=${testConfig.supabaseUrl}
NEXT_PUBLIC_SITE_URL=${PLAYWRIGHT_BASE_URL}
`;
  
  fs.writeFileSync(testEnvPath, testEnvContent);
  console.log('Created .env.test with test database configuration');

  await resetAndSeedTestDatabase(testConfig);
  await runCommand(npmCommand, ['run', 'build'], env);
  
  // Clean up .env.test after build
  if (fs.existsSync(testEnvPath)) {
    fs.unlinkSync(testEnvPath);
    console.log('Removed temporary .env.test');
  }
  
  startCommand(npmCommand, ['run', 'start', '--', '--port', String(PLAYWRIGHT_PORT)], env);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
