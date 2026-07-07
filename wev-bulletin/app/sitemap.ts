import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { getSiteBaseUrl } from '@/lib/site-url';
import { supabaseServer } from '@/lib/supabase-server';
import { BULLETIN_MAX_AGE_DAYS } from '@/lib/bulletin/constants';

export const revalidate = 3600;

const siteBaseUrl = getSiteBaseUrl() || 'https://bulletin.wevchange.org';
const MAX_ORG_SLUGS = 1000;

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
    const minDate = new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: orgs, error } = await supabaseServer
      .rpc('get_active_organizations', {
        min_date: minDate,
        p_limit: MAX_ORG_SLUGS,
        p_offset: 0,
      });

    if (error) {
      console.error('Error fetching organizations for sitemap:', error);
    } else if (orgs) {
      for (const org of orgs) {
        if (!org.slug) continue;

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
      }
    }
  } catch (error) {
    console.error('Error fetching organizations for sitemap:', error);
  }

  return sitemapEntries;
}
