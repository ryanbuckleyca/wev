export const LOCALE_AWARE_FTS_MIGRATION = '20260419160000_add_locale_aware_job_fts.sql';

type PostgrestError = { code?: string; message?: string };

export function isUndefinedColumnError(error: PostgrestError | null): boolean {
  return error?.code === '42703';
}

export function throwBulletinQueryError(
  error: PostgrestError | null,
  options?: { searchQuery?: string; searchColumn?: string },
): never {
  if (
    options?.searchQuery &&
    options.searchQuery.trim().length > 0 &&
    isUndefinedColumnError(error)
  ) {
    const column = options.searchColumn ?? 'fts_en or fts_fr';
    throw new Error(
      `Bulletin search requires locale-aware FTS columns on matched_jobs (missing: ${column}). ` +
        `Apply migration ${LOCALE_AWARE_FTS_MIGRATION} before deploying this version.`,
    );
  }

  throw new Error(error?.message ?? 'Failed to fetch bulletin');
}
