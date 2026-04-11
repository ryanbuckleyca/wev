import { spawn } from 'node:child_process';
import process from 'node:process';
import { resetAndSeedDatabase } from '@/lib/supabase/seed/seeder';
import {
  getSupabaseDatabaseConfig,
  getWebServerEnv,
  loadSupabaseEnv,
  PLAYWRIGHT_PORT,
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
    stdio: 'inherit',
  });

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
  loadSupabaseEnv();

  const env = createCommandEnv();

  await resetAndSeedDatabase(getSupabaseDatabaseConfig());
  await runCommand(npmCommand, ['run', 'build'], env);
  startCommand(npmCommand, ['run', 'start', '--', '--port', String(PLAYWRIGHT_PORT)], env);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
