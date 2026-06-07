export type CvLocale = 'en' | 'fr';

export function parseLocale(value: string | null): CvLocale {
  return (value ?? '').trim().toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
