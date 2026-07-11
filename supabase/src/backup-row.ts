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

/** Column used with delete filters to wipe a table (non-null + null passes). */
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
 *
 * Reset SQL is keyed by table name (no string interpolation) so identifiers
 * cannot be injected via restore args.
 */
export const RESTORE_IDENTITY_TABLES = ["organizations"] as const;

export type RestoreIdentityTable = (typeof RESTORE_IDENTITY_TABLES)[number];

/** Fixed SQL per allowlisted identity table — do not build these from user input. */
export const IDENTITY_RESET_SQL: Record<RestoreIdentityTable, string> = {
  organizations: `
DO $$
DECLARE
  seq text := pg_get_serial_sequence('public.organizations', 'id');
  max_id bigint;
BEGIN
  IF seq IS NULL THEN
    RAISE NOTICE 'No identity sequence for public.organizations';
    RETURN;
  END IF;
  SELECT MAX(id) INTO max_id FROM public.organizations;
  IF max_id IS NULL THEN
    PERFORM setval(seq, 1, false);
  ELSE
    PERFORM setval(seq, max_id, true);
  END IF;
END $$;
`,
};
