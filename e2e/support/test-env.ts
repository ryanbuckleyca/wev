import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

export const PLAYWRIGHT_PORT = 3001;
export const PLAYWRIGHT_BASE_URL = `http://127.0.0.1:${PLAYWRIGHT_PORT}`;

const LOCAL_ENV_PATH = path.resolve(process.cwd(), '.env');

export interface E2ETestDatabaseConfig {
  projectRef: string;
  serviceRoleKey: string;
  supabaseUrl: string;
}

function getOptionalEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function getRequiredEnv(...names: string[]): string {
  const value = getOptionalEnv(...names);
  if (!value) {
    throw new Error(`Missing required e2e environment variable: ${names.join(' or ')}`);
  }
  return value;
}

export function loadPlaywrightEnv(): void {
  if (!fs.existsSync(LOCAL_ENV_PATH)) {
    throw new Error(
      'Playwright requires a local .env file for the dedicated wev-test Supabase project.',
    );
  }

  loadEnv({ path: LOCAL_ENV_PATH });
}

export function getWebServerEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

export function getE2ETestDatabaseConfig(): E2ETestDatabaseConfig {
  return {
    projectRef: getRequiredEnv('SUPABASE_PROJECT_REF', 'E2E_SUPABASE_PROJECT_REF'),
    serviceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'E2E_SUPABASE_SERVICE_ROLE_KEY'),
    supabaseUrl: getRequiredEnv('SUPABASE_URL', 'E2E_SUPABASE_URL'),
  };
}
