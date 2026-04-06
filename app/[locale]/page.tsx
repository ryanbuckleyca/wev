import { Suspense } from 'react';
import { routing } from '@/i18n/routing';
import { parseLocale } from '@/lib/resolve-skill-labels';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import { rolesIncludeAdmin } from '@/lib/auth';
import { fetchBulletinJobs } from '@/lib/bulletin/server-data';
import BulletinPageClient from '@/components/BulletinPageClient';
import LoadingIndicator from '@/components/LoadingIndicator';

// Renders the data fetch independently inside a Suspense boundary
async function BulletinDataContainer({
  parsedLocale,
  isLoggedIn,
  isAdmin,
}: {
  parsedLocale: 'en' | 'fr';
  isLoggedIn: boolean;
  isAdmin: boolean;
}) {
  const bulletinData = await fetchBulletinJobs(parsedLocale);

  return (
    <BulletinPageClient
      initialJobs={bulletinData.jobs}
      initialScrapeTime={bulletinData.lastScrapeTime}
      initialSkillLabels={bulletinData.skillLabels}
      isLoggedIn={isLoggedIn}
      isAdmin={isAdmin}
    />
  );
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const validLocales = routing.locales as readonly string[];
  const locale = validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const parsedLocale = parseLocale(locale);

  // Auth reads the cookie (now via getSession) → zero network calls, so we
  // await it BEFORE the Suspense boundary so the auth state passes synchronously.
  const auth = await getRequestUser();

  let isAdmin = false;
  if (auth.ok) {
    // Roles is a single tiny cached query — worth blocking on so the admin UI renders
    // correctly on first paint (avoids a flash of the non-admin view).
    const rolesResult = await fetchUserRolesFromService(auth.user.id);
    const resolvedRoles = rolesResult.ok ? rolesResult.roles : ['user'];
    isAdmin = rolesIncludeAdmin(resolvedRoles);
  }

  // The outer page renders the instant HTML layout shell immediately.
  // The BulletinDataContainer fetches the jobs JSON payload and streams it.
  return (
    <Suspense fallback={<LoadingIndicator />}>
      <BulletinDataContainer
        parsedLocale={parsedLocale}
        isLoggedIn={auth.ok}
        isAdmin={isAdmin}
      />
    </Suspense>
  );
}
