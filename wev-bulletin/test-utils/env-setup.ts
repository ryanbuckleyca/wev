import path from 'node:path';
import { config } from 'dotenv';

/**
 * Loads the test environment from the monorepo root.
 * This abstracts away the verbose path.resolve boilerplate.
 */
export function setupTestEnv() {
  // Always resolve relative to this file's location inside the monorepo
  const rootEnvPath = path.resolve(__dirname, '../../.env.test');
  
  config({ 
    path: rootEnvPath,
    override: true 
  });

  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}
