import { Suspense } from 'react';
import { routing } from '@/i18n/routing';
import { parseLocale } from '@/lib/resolve-skill-labels';
import { fetchServerBulletinJobs } from '@/lib/bulletin/server-data';
import BulletinPageClient from '@/components/BulletinPageClient';
import BulletinPageSkeleton from '@/components/BulletinPageSkeleton';

/** ISR so Cloudflare/CDN can cache the anonymous jobs shell. */
export const revalidate = 60;

/** Renders the cached anonymous jobs shell inside the home page Suspense boundary. */
export async function BulletinDataContainer({ parsedLocale }: { parsedLocale: 'en' | 'fr' }) {
  // Anonymous SSR shell for CDN caching. BulletinPageClient discards it before
  // paint when a session cookie is present and shows a skeleton until the
  // personalized client fetch (profile filters + matches) is ready.
  const bulletinData = await fetchServerBulletinJobs(parsedLocale);

  return (
    <BulletinPageClient
      initialJobs={bulletinData.jobs}
      initialScrapeTime={bulletinData.lastScrapeTime}
      initialTotalJobs={bulletinData.total}
      initialTotalAvailable={bulletinData.totalAvailable}
      initialSkillLabels={bulletinData.skillLabels}
      initialFilterOptions={bulletinData.filterOptions}
      initialUserId={null}
      isLoggedIn={false}
      isAdmin={false}
    />
  );
}

/** Locale home page: instant shell plus Suspense-wrapped anonymous jobs data. */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const validLocales = routing.locales as readonly string[];
  const locale = validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const parsedLocale = parseLocale(locale);

  // The outer page renders the instant HTML layout shell immediately.
  // BulletinDataContainer resolves cached jobs; auth hydrates client-side.
  return (
    <Suspense fallback={<BulletinPageSkeleton />}>
      <BulletinDataContainer parsedLocale={parsedLocale} />
    </Suspense>
  );
}
