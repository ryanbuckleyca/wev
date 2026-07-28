/**
 * Pick locale-specific org prose with fallbacks.
 * Prefer explicit _{locale}, then the other locale, then legacy monolingual column.
 */

function firstNonEmptyTrimmed(...candidates: unknown[]): string | null {
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

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
  return firstNonEmptyTrimmed(
    org[`${field}_${preferred}` as keyof typeof org],
    org[`${field}_${other}` as keyof typeof org],
    org[field],
  );
}

export function pickSseReasoning(
  sseDetails: Record<string, unknown> | null | undefined,
  locale: string,
): string | null {
  if (!sseDetails) return null;
  const preferred = locale.startsWith('fr') ? 'fr' : 'en';
  const other = preferred === 'fr' ? 'en' : 'fr';
  return firstNonEmptyTrimmed(
    sseDetails[`reasoning_${preferred}`],
    sseDetails[`reasoning_${other}`],
    sseDetails.reasoning,
  );
}
