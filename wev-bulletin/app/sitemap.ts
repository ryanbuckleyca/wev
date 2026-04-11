import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { getSiteBaseUrl } from '@/lib/site-url';

const siteBaseUrl = getSiteBaseUrl() || 'https://bulletin.wevchange.org';

export default function sitemap(): MetadataRoute.Sitemap {
  const localeEntries = Object.fromEntries(
    routing.locales.map((locale) => [locale, `${siteBaseUrl}/${locale}`]),
  );

  return routing.locales.map((locale) => ({
    url: `${siteBaseUrl}/${locale}`,
    changeFrequency: 'hourly' as const,
    priority: locale === routing.defaultLocale ? 1 : 0.9,
    alternates: {
      languages: localeEntries,
    },
  }));
}
