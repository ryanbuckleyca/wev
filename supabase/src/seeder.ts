import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  createSeedDataset,
  type SeedTables,
  type SourceInsert,
} from "./dataset";
import fs from "node:fs";
import path from "node:path";

export interface SupabaseDatabaseConfig {
  projectRef: string;
  serviceRoleKey: string;
  supabaseUrl: string;
}

type ClearTable = {
  column: string;
  name:
    | "bookmarks"
    | "job_matches"
    | "jobs"
    | "profiles"
    | "scrape_runs"
    | "sources"
    | "user_roles";
};

const CLEAR_TABLES: ClearTable[] = [
  { name: "bookmarks", column: "job_id" },
  { name: "job_matches", column: "job_id" },
  { name: "jobs", column: "id" },
  { name: "profiles", column: "id" },
  { name: "scrape_runs", column: "id" },
  { name: "sources", column: "id" },
  { name: "user_roles", column: "user_id" },
];

const INSERT_BATCH_SIZE = 50;
// Smaller batches avoid hitting PostgREST statement timeouts when upserting
// large vector payloads (1024-dim embeddings). 100 rows ≈ ~400KB per request.
const ESCO_UPSERT_BATCH_SIZE = 100;

type EscoIndexSkillRecord = {
  concept_uri: string;
  skill_type?: string;
  reuse_level?: string;
  preferred_label?: {
    en?: string;
    fr?: string;
  };
  alternative_label?: {
    en?: string[];
    fr?: string[];
  };
  description?: {
    en?: string;
    fr?: string;
  };
  scope_note?: {
    en?: string;
    fr?: string;
  };
};

type EscoSkillsPayload = {
  skills: EscoIndexSkillRecord[];
};

function assertExpectedProjectRef(
  supabaseUrl: string,
  expectedProjectRef: string,
): void {
  const actualProjectRef = new URL(supabaseUrl).hostname.split(".")[0];
  if (
    actualProjectRef !== expectedProjectRef &&
    expectedProjectRef !== "supabase"
  ) {
    throw new Error(
      `Refusing to seed ${actualProjectRef}. Expected Supabase project ref ${expectedProjectRef}.`,
    );
  }
}

function createDatabaseClient({
  serviceRoleKey,
  supabaseUrl,
}: Pick<
  SupabaseDatabaseConfig,
  "serviceRoleKey" | "supabaseUrl"
>): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function clearTable(
  client: SupabaseClient<Database>,
  { name, column }: ClearTable,
): Promise<void> {
  const { error } = await client.from(name).delete().not(column, "is", null);
  if (error) {
    // If the table doesn't exist yet, we don't need to clear it.
    if (
      error.message.includes("Could not find the table") ||
      error.message.includes("does not exist")
    ) {
      console.log(`▶ Skipping clear for ${name} (table not found)`);
      return;
    }
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

async function seedTables(
  client: SupabaseClient<Database>,
  tables: SeedTables,
): Promise<void> {
  await insertRows("sources", tables.sources, async (batch) =>
    client.from("sources").insert(batch),
  );
  await insertRows("jobs", tables.jobs, async (batch) =>
    client.from("jobs").insert(batch),
  );
  await insertRows("profiles", tables.profiles, async (batch) =>
    client.from("profiles").insert(batch),
  );
  await insertRows("user_roles", tables.userRoles, async (batch) =>
    client.from("user_roles").insert(batch),
  );
  await insertRows("scrape_runs", tables.scrapeRuns, async (batch) =>
    client.from("scrape_runs").insert(batch),
  );
  await insertRows("job_matches", tables.jobMatches, async (batch) =>
    client.from("job_matches").insert(batch),
  );
  await insertRows("bookmarks", tables.bookmarks, async (batch) =>
    client.from("bookmarks").insert(batch),
  );
}

function findEscoSkillsIndexPath(): string {
  const candidates = [
    path.resolve(__dirname, "../backups/backup_public_esco_skills.json"),
    path.resolve(process.cwd(), "supabase/backups/backup_public_esco_skills.json"),
    path.resolve(__dirname, "../seed/esco_skills_index.json"),
    path.resolve(process.cwd(), "supabase/seed/esco_skills_index.json"),
    path.resolve(process.cwd(), "seed/esco_skills_index.json"),
  ];

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(
      "Missing ESCO skills seed file. Expected supabase/seed/esco_skills_index.json or supabase/backups/backup_public_esco_skills.json from repo root.",
    );
  }
  return match;
}

function parseEscoSkillsPayload(filePath: string): any[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const payload = JSON.parse(raw);

  // Handle backup format (plain array) or index format ({ skills: [] })
  const records = Array.isArray(payload) ? payload : payload.skills;

  if (!Array.isArray(records)) {
    throw new Error(`Invalid ESCO skills payload at ${filePath}`);
  }
  return records.filter((skill) => !!skill?.concept_uri);
}

function toEscoDbRow(skill: any, timestamp: string) {
  return {
    concept_uri: skill.concept_uri,
    skill_type: skill.skill_type ?? null,
    reuse_level: skill.reuse_level ?? null,
    preferred_label_en:
      skill.preferred_label_en ??
      skill.preferred_label?.en ??
      skill.preferred_label?.fr ??
      null,
    preferred_label_fr:
      skill.preferred_label_fr ??
      skill.preferred_label?.fr ??
      skill.preferred_label?.en ??
      null,
    alternative_label_en:
      skill.alternative_label_en ?? skill.alternative_label?.en ?? [],
    alternative_label_fr:
      skill.alternative_label_fr ?? skill.alternative_label?.fr ?? [],
    description_en: skill.description_en ?? skill.description?.en ?? null,
    description_fr: skill.description_fr ?? skill.description?.fr ?? null,
    scope_note_en: skill.scope_note_en ?? skill.scope_note?.en ?? null,
    scope_note_fr: skill.scope_note_fr ?? skill.scope_note?.fr ?? null,
    embedding: skill.embedding ?? null,
    updated_at: skill.updated_at ?? timestamp,
  };
}

async function seedEscoSkills(client: SupabaseClient<Database>): Promise<void> {
  const filePath = findEscoSkillsIndexPath();
  const records = parseEscoSkillsPayload(filePath);
  const timestamp = new Date().toISOString();

  if (records.length === 0) {
    throw new Error(`ESCO skills payload is empty at ${filePath}`);
  }

  console.log(
    `▶ Seeding esco_skills from ${filePath} (${records.length} skills)`,
  );

  for (let i = 0; i < records.length; i += ESCO_UPSERT_BATCH_SIZE) {
    const chunk = records
      .slice(i, i + ESCO_UPSERT_BATCH_SIZE)
      .map((skill) => toEscoDbRow(skill, timestamp));
    const { error } = await (client as any)
      .from("esco_skills")
      .upsert(chunk, { onConflict: "concept_uri" });

    if (error) {
      throw new Error(`Failed seeding esco_skills: ${error.message}`);
    }
  }

  console.log("✅ Seeded esco_skills.");
}

/**
 * Clears and seeds the database with the provided (or default) dataset.
 * Supports injecting live production sources into the staging environment.
 */
export async function resetAndSeedDatabase(
  config: SupabaseDatabaseConfig,
  sourceOverrides?: SourceInsert[],
): Promise<void> {
  // Relaxed project ref check for local development
  if (
    config.projectRef !== "127" &&
    config.projectRef !== "localhost" &&
    config.projectRef !== "supabase"
  ) {
    assertExpectedProjectRef(config.supabaseUrl, config.projectRef);
  }

  const client = createDatabaseClient(config);
  const dataset = createSeedDataset(new Date(), sourceOverrides);

  await clearTables(client);
  await seedTables(client, dataset.tables);
  await seedEscoSkills(client);
}
