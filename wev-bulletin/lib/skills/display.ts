/**
 * Shared helpers for normalizing and deduplicating skill display rows.
 * Used by both /api/skills/search and /api/skills/by-uri routes.
 */

export function normalizeSkillText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function skillDisplayKey(
  term: string,
  definition: string | null | undefined,
  scopeNote: string | null | undefined,
): string {
  return `${normalizeSkillText(term)}::${normalizeSkillText(definition)}::${normalizeSkillText(scopeNote)}`;
}
