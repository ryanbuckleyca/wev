/**
 * Formats a search query string for Postgres full-text search.
 * If the query is a simple single word, it appends ':*' for prefix matching.
 * Otherwise, it returns the query as-is for websearch.
 */
export function formatSearchQuery(query: string): { formatted: string; type: 'websearch' | 'plain' } {
  const trimmed = query.trim();
  if (!trimmed) return { formatted: '', type: 'websearch' };

  // If it's a single word with no special chars, use prefix matching
  if (/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return { formatted: `${trimmed}:*`, type: 'plain' };
  }

  // Fall back to standard websearch for complex queries
  return { formatted: trimmed, type: 'websearch' };
}
