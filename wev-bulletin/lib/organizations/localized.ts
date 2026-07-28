/**
 * Pick locale-specific org prose with fallbacks.
 * Prefer explicit _{locale}, then the other locale, then legacy monolingual column.
 */
export function pickOrgLocalizedText(
  org: {
    description?: string | null;
    description_en?: string | null;
    description_fr?: string | null;
    mission_statement?: string | null;
    mission_statement_en?: string | null;
    mission_statement_fr?: string | null;
  },
  field: 'description' | 'mission_statement',
  locale: string,
): string | null {
  const preferred = locale.startsWith('fr') ? 'fr' : 'en';
  const other = preferred === 'fr' ? 'en' : 'fr';
  const localizedPreferred = org[`${field}_${preferred}` as keyof typeof org];
  const localizedOther = org[`${field}_${other}` as keyof typeof org];
  const legacy = org[field];

  for (const value of [localizedPreferred, localizedOther, legacy]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function pickSseReasoning(
  sseDetails: Record<string, unknown> | null | undefined,
  locale: string,
): string | null {
  if (!sseDetails) return null;
  const preferred = locale.startsWith('fr') ? 'fr' : 'en';
  const other = preferred === 'fr' ? 'en' : 'fr';
  for (const key of [`reasoning_${preferred}`, `reasoning_${other}`, 'reasoning'] as const) {
    const value = sseDetails[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
