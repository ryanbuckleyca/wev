import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { createSeedDataset, type SeedTables } from './dataset';
import type { SupabaseDatabaseConfig } from './env';

type ClearTable = {
  column: string;
  name:
    | 'bookmarks'
    | 'job_matches'
    | 'jobs'
    | 'profiles'
    | 'scrape_runs'
    | 'sources'
    | 'user_roles';
};

const CLEAR_TABLES: ClearTable[] = [
  { name: 'bookmarks', column: 'job_id' },
  { name: 'job_matches', column: 'job_id' },
  { name: 'jobs', column: 'id' },
  { name: 'profiles', column: 'id' },
  { name: 'scrape_runs', column: 'id' },
  { name: 'sources', column: 'id' },
  { name: 'user_roles', column: 'user_id' },
];

const INSERT_BATCH_SIZE = 50;

function assertExpectedProjectRef(supabaseUrl: string, expectedProjectRef: string): void {
  const actualProjectRef = new URL(supabaseUrl).hostname.split('.')[0];
  if (actualProjectRef !== expectedProjectRef && expectedProjectRef !== 'supabase') {
    throw new Error(
      `Refusing to seed ${actualProjectRef}. Expected Supabase project ref ${expectedProjectRef}.`,
    );
  }
}

function createDatabaseClient({
  serviceRoleKey,
  supabaseUrl,
}: Pick<SupabaseDatabaseConfig, 'serviceRoleKey' | 'supabaseUrl'>): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function clearTable(
  client: SupabaseClient<Database>,
  { name, column }: ClearTable,
): Promise<void> {
  const { error } = await client.from(name).delete().not(column, 'is', null);
  if (error) {
    throw new Error(`Failed clearing ${name}: ${error.message}`);
  }
}

async function insertRows<Row>(
  tableName: string,
  rows: Row[],
  insertBatch: (batch: Row[]) => Promise<{ error: { message: string } | null }>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + INSERT_BATCH_SIZE);
    const { error } = await insertBatch(batch);
    if (error) {
      throw new Error(`Failed seeding ${tableName}: ${error.message}`);
    }
  }
}

async function clearTables(client: SupabaseClient<Database>): Promise<void> {
  for (const table of CLEAR_TABLES) {
    await clearTable(client, table);
  }
}

async function seedTables(client: SupabaseClient<Database>, tables: SeedTables): Promise<void> {
  await insertRows('sources', tables.sources, async (batch) =>
    client.from('sources').insert(batch),
  );
  await insertRows('jobs', tables.jobs, async (batch) => client.from('jobs').insert(batch));
  await insertRows('profiles', tables.profiles, async (batch) =>
    client.from('profiles').insert(batch),
  );
  await insertRows('user_roles', tables.userRoles, async (batch) =>
    client.from('user_roles').insert(batch),
  );
  await insertRows('scrape_runs', tables.scrapeRuns, async (batch) =>
    client.from('scrape_runs').insert(batch),
  );
  await insertRows('job_matches', tables.jobMatches, async (batch) =>
    client.from('job_matches').insert(batch),
  );
  await insertRows('bookmarks', tables.bookmarks, async (batch) =>
    client.from('bookmarks').insert(batch),
  );
}

/**
 * Clears and seeds the database with the provided (or default) dataset.
 */
export async function resetAndSeedDatabase(config: SupabaseDatabaseConfig): Promise<void> {
  // Relaxed project ref check for local development
  if (config.projectRef !== '127' && config.projectRef !== 'localhost') {
     assertExpectedProjectRef(config.supabaseUrl, config.projectRef);
  }

  const client = createDatabaseClient(config);
  const dataset = createSeedDataset();

  await clearTables(client);
  await seedTables(client, dataset.tables);
}
