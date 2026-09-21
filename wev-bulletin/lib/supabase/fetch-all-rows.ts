/**
 * PostgREST response cap (`max_rows` in supabase/config.toml).
 * Unpaged `.select()` calls silently truncate at this size — page with `.range()`.
 */
export const POSTGREST_MAX_ROWS = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Drain a PostgREST select by paging through `.range()` until a short page.
 * Callers must apply a stable `.order(...)` so pages don't skip/duplicate rows.
 */
export async function fetchAllPagedRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += POSTGREST_MAX_ROWS) {
    const to = from + POSTGREST_MAX_ROWS - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) {
      throw new Error(error.message);
    }

    const chunk = data ?? [];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < POSTGREST_MAX_ROWS) break;
  }

  return rows;
}
