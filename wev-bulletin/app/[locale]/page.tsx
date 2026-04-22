import { Suspense } from 'react';
import { routing } from '@/i18n/routing';
import { parseLocale } from '@/lib/resolve-skill-labels';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import { rolesIncludeAdmin } from '@/lib/auth';
import { fetchServerBulletinJobs } from '@/lib/bulletin/server-data';
import BulletinPageClient from '@/components/BulletinPageClient';
import BulletinPageSkeleton from '@/components/BulletinPageSkeleton';

// Renders the data fetch independently inside a Suspense boundary
export async function BulletinDataContainer({ parsedLocale }: { parsedLocale: 'en' | 'fr' }) {
  const authPromise = getRequestUser();
  const bulletinDataPromise = fetchServerBulletinJobs(parsedLocale);
  const auth = await authPromise;

  let isAdmin = false;
  let initialUserId: string | null = null;

  if (auth.ok) {
    initialUserId = auth.user.id;
    const rolesResult = await fetchUserRolesFromService(auth.user.id);
    const resolvedRoles = rolesResult.ok ? rolesResult.roles : ['user'];
    isAdmin = rolesIncludeAdmin(resolvedRoles);
  }

  const bulletinData = await bulletinDataPromise;

  return (
    <BulletinPageClient
      initialJobs={bulletinData.jobs}
      initialScrapeTime={bulletinData.lastScrapeTime}
      initialTotalJobs={bulletinData.total}
      initialSkillLabels={bulletinData.skillLabels}
      initialUserId={initialUserId}
      isLoggedIn={auth.ok}
      isAdmin={isAdmin}
    />
  );
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const validLocales = routing.locales as readonly string[];
  const locale = validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const parsedLocale = parseLocale(locale);

  // The outer page renders the instant HTML layout shell immediately.
  // BulletinDataContainer resolves cached jobs + auth role data, while match/bookmark/profile
  // metadata hydrate client-side after first paint.
  return (
    <Suspense fallback={<BulletinPageSkeleton />}>
      <BulletinDataContainer parsedLocale={parsedLocale} />
    </Suspense>
  );
}
