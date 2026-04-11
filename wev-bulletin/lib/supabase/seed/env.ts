import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

const findEnvPath = () => {
  const cwd = process.cwd();
  const local = path.resolve(cwd, '.env');
  if (fs.existsSync(local)) return local;
  return path.resolve(cwd, '..', '.env');
};

const LOCAL_ENV_PATH = findEnvPath();

export interface SupabaseDatabaseConfig {
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

export function getOptionalEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

export function getRequiredEnv(...names: string[]): string {
  const value = getOptionalEnv(...names);
  if (!value) {
    throw new Error(`Missing required environment variable: ${names.join(' or ')}`);
  }
  return value;
}

/**
 * Loads environment variables from a .env file.
 */
export function loadSupabaseEnv(): void {
  if (fs.existsSync(LOCAL_ENV_PATH)) {
    loadEnv({ path: LOCAL_ENV_PATH });
  } else {
    console.warn(`⚠ Warning: .env file not found at ${LOCAL_ENV_PATH}. Proceeding with existing process.env.`);
  }
}

/**
 * Retrieves Supabase configuration for seeding/migration.
 */
export function getSupabaseDatabaseConfig(): SupabaseDatabaseConfig {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL', 'E2E_SUPABASE_URL');

  return {
    projectRef:
      getOptionalEnv('SUPABASE_PROJECT_REF', 'E2E_SUPABASE_PROJECT_REF') ??
      extractProjectRefFromUrl(supabaseUrl),
    serviceRoleKey: getRequiredEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
      'E2E_SUPABASE_SERVICE_ROLE_KEY',
    ),
    supabaseUrl,
  };
}
