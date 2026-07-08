import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { getSiteBaseUrl } from '@/lib/site-url';
import { supabaseServer } from '@/lib/supabase-server';
import { bulletinAgeCutoffIso } from '@/lib/bulletin/constants';

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
    const minDate = bulletinAgeCutoffIso();
    const seenSlugs = new Set<string>();
    const MAX_ORG_PAGES = 10;

    for (let page = 0; page < MAX_ORG_PAGES; page++) {
      const { data: orgs, error } = await supabaseServer
        .rpc('get_active_organizations', {
          min_date: minDate,
          p_limit: MAX_ORG_SLUGS,
          p_offset: page * MAX_ORG_SLUGS,
        })
        .select('slug');

      if (error) {
        console.error('Error fetching organizations for sitemap (page %d):', page, error);
        break;
      }

      if (!orgs || orgs.length === 0) break;

      for (const org of orgs) {
        if (!org.slug || seenSlugs.has(org.slug)) continue;
        seenSlugs.add(org.slug);

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

      if (orgs.length < MAX_ORG_SLUGS) break;
    }
  } catch (error) {
    console.error('Error fetching organizations for sitemap:', error);
  }

  return sitemapEntries;
}
