export function normalizeSkillText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function skillDisplayKey(
  term: string,
  definition: string | null,
  scopeNote: string | null,
): string {
  return `${normalizeSkillText(term)}::${normalizeSkillText(definition)}::${normalizeSkillText(scopeNote)}`;
}
