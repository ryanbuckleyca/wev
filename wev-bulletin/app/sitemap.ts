import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { getSiteBaseUrl } from '@/lib/site-url';
import { supabaseServer } from '@/lib/supabase-server';

const siteBaseUrl = getSiteBaseUrl() || 'https://bulletin.wevchange.org';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitemapEntries: MetadataRoute.Sitemap = [];

  const homeLocaleEntries = Object.fromEntries(
    routing.locales.map((locale) => [locale, `${siteBaseUrl}/${locale}`]),
  );

  routing.locales.forEach((locale) => {
    sitemapEntries.push({
      url: `${siteBaseUrl}/${locale}`,
      changeFrequency: 'hourly' as const,
      priority: locale === routing.defaultLocale ? 1 : 0.9,
      alternates: {
        languages: homeLocaleEntries,
      },
    });
  });

  const orgLocaleEntries = Object.fromEntries(
    routing.locales.map((locale) => [locale, `${siteBaseUrl}/${locale}/organizations`]),
  );

  routing.locales.forEach((locale) => {
    sitemapEntries.push({
      url: `${siteBaseUrl}/${locale}/organizations`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
      alternates: {
        languages: orgLocaleEntries,
      },
    });
  });

  try {
    const { data: orgs, error } = await supabaseServer
      .from('organizations')
      .select('slug')
      .limit(50000);

    if (error) {
      console.error('Error fetching organizations for sitemap:', error);
    } else if (orgs) {
      orgs.forEach((org) => {
        if (!org.slug) return;

        const slugLocaleEntries = Object.fromEntries(
          routing.locales.map((locale) => [
            locale,
            `${siteBaseUrl}/${locale}/organizations/${org.slug}`,
          ]),
        );

        routing.locales.forEach((locale) => {
          sitemapEntries.push({
            url: `${siteBaseUrl}/${locale}/organizations/${org.slug}`,
            changeFrequency: 'daily' as const,
            priority: 0.7,
            alternates: {
              languages: slugLocaleEntries,
            },
          });
        });
      });
    }
  } catch (error) {
    console.error('Error fetching organizations for sitemap:', error);
  }

  return sitemapEntries;
}
