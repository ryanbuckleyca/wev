type TranslateFn = (key: string) => string;

export function getWorkTypeLabel(workType: string, t: TranslateFn): string {
  if (workType === 'remote') return t('filters.workType.remote');
  if (workType === 'hybrid') return t('filters.workType.hybrid');
  if (workType === 'office') return t('filters.workType.office');
  return workType.charAt(0).toUpperCase() + workType.slice(1);
}

export function getJobLanguageLabel(lang: string, t: TranslateFn): string {
  if (lang === 'en') return t('filters.language.en');
  if (lang === 'fr') return t('filters.language.fr');
  if (lang === 'bilingual') return t('filters.language.bilingual');
  return lang;
}
