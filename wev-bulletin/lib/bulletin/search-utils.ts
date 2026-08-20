/**
 * Formats a search query string for Postgres full-text search.
 * If the query is a simple single word, it appends ':*' for prefix matching.
 * Otherwise, it returns the query as-is for websearch.
 */
export function formatSearchQuery(query: string): {
  formatted: string;
  type: 'websearch' | 'plain' | 'fts';
} {
  const trimmed = query.trim();
  if (!trimmed) return { formatted: '', type: 'websearch' };

  // If it's a single word (including Unicode/accented characters) with no special chars, use prefix matching
  if (/^[\p{L}\p{N}]+$/u.test(trimmed)) {
    return { formatted: `${trimmed}:*`, type: 'fts' };
  }

  // Fall back to standard websearch for complex queries
  return { formatted: trimmed, type: 'websearch' };
}

/**
 * Normalizes a location name (municipality or province) for comparison/filtering (unaccented lowercase).
 */
export function normalizeLocation(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
