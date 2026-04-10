import type { MetadataRoute } from 'next';
import { getSiteBaseUrl } from '@/lib/site-url';

const siteBaseUrl = getSiteBaseUrl() || 'https://bulletin.wevchange.org';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${siteBaseUrl}/sitemap.xml`,
    host: siteBaseUrl,
  };
}
