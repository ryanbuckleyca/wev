/** Columns stored in backup JSON but not accepted on INSERT (DB-generated). */

export const GENERATED_COLUMN_PATTERNS = [
  /^fts(?:_[a-z]{2,})?$/i,
  /_fts$/i,
  /search_vector$/i,
  /^has_compensation$/i,
  /^ideal_work_environment$/i,
] as const;

export function isGeneratedBackupColumn(column: string): boolean {
  return GENERATED_COLUMN_PATTERNS.some((pattern) => pattern.test(column));
}

export function sanitizeBackupRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!isGeneratedBackupColumn(key)) {
      clean[key] = value;
    }
  }
  return clean;
}

/** Column used with `.not(col, "is", null)` to delete all rows in a table. */
export const TABLE_CLEAR_COLUMN: Record<string, string> = {
  bookmarks: "job_id",
  job_matches: "job_id",
  jobs: "id",
  organizations: "id",
  profiles: "id",
  scrape_runs: "id",
  sources: "id",
  user_roles: "user_id",
};

/** Primary key / conflict target for upsert during restore. */
export const TABLE_UPSERT_CONFLICT: Record<string, string> = {
  esco_skills: "concept_uri",
  jobs: "id",
  organizations: "id",
  profiles: "id",
  scrape_runs: "id",
  sources: "id",
  user_roles: "user_id",
};

/** Clear dependent tables before parents on restore. */
export const RESTORE_CLEAR_ORDER = [
  "jobs",
  "scrape_runs",
  "profiles",
  "user_roles",
  "sources",
  "organizations",
] as const;

export const RESTORE_INSERT_ORDER = [
  "esco_skills",
  "organizations",
  "sources",
  "user_roles",
  "profiles",
  "jobs",
  "scrape_runs",
] as const;

/**
 * Tables restored with explicit integer identity PKs. After upsert, sequences
 * must be advanced to MAX(id) or the next INSERT collides (e.g. admin org create).
 */
export const RESTORE_IDENTITY_TABLES = ["organizations"] as const;
