export const SUPPORTED_LANGUAGES = ['en', 'fr', 'bilingual'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguages(values?: Array<string | null | undefined> | null): SupportedLanguage[] {
  const unique = new Set<SupportedLanguage>();
  for (const value of values ?? []) {
    if (value && isSupportedLanguage(value)) unique.add(value);
  }
  return Array.from(unique);
}
