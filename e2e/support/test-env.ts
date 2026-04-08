import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

export const PLAYWRIGHT_PORT = 3000;
export const PLAYWRIGHT_BASE_URL = `http://localhost:${PLAYWRIGHT_PORT}`;

const LOCAL_ENV_PATH = path.resolve(process.cwd(), '.env');

export interface E2ETestDatabaseConfig {
  projectRef: string;
  serviceRoleKey: string;
  supabaseUrl: string;
}

function extractProjectRefFromUrl(supabaseUrl: string): string {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split('.')[0]?.trim();

    if (!projectRef) {
      throw new Error('Missing hostname');
    }

    return projectRef;
  } catch {
    throw new Error(`Unable to derive SUPABASE_PROJECT_REF from SUPABASE_URL: ${supabaseUrl}`);
  }
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
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  // Ensure auth emails generated during Playwright runs point back to the e2e app port.
  env.NEXT_PUBLIC_SITE_URL = PLAYWRIGHT_BASE_URL;
  return env;
}

export function getE2ETestDatabaseConfig(): E2ETestDatabaseConfig {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL', 'E2E_SUPABASE_URL');

  return {
    projectRef:
      getOptionalEnv('SUPABASE_PROJECT_REF', 'E2E_SUPABASE_PROJECT_REF') ??
      extractProjectRefFromUrl(supabaseUrl),
    serviceRoleKey: getRequiredEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEY',
      'E2E_SUPABASE_SERVICE_ROLE_KEY',
    ),
    supabaseUrl,
  };
}
