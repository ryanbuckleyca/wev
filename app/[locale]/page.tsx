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
}: {
  parsedLocale: 'en' | 'fr';
}) {
  // Move all blocking queries inside the Suspense boundary so they don't delay the initial HTML stream
  const authPromise = getRequestUser();
  const jobsPromise = fetchBulletinJobs(parsedLocale);

  const [auth, bulletinData] = await Promise.all([authPromise, jobsPromise]);

  let isAdmin = false;
  if (auth.ok) {
    const rolesResult = await fetchUserRolesFromService(auth.user.id);
    const resolvedRoles = rolesResult.ok ? rolesResult.roles : ['user'];
    isAdmin = rolesIncludeAdmin(resolvedRoles);
  }

  return (
    <BulletinPageClient
      initialJobs={bulletinData.jobs}
      initialScrapeTime={bulletinData.lastScrapeTime}
      initialSkillLabels={bulletinData.skillLabels}
      isLoggedIn={auth.ok}
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

  // The outer page renders the instant HTML layout shell immediately.
  // The BulletinDataContainer fetches the jobs JSON payload and auth sequentially
  // inside the Suspense boundary, swapping the spinner once ready.
  return (
    <Suspense fallback={<LoadingIndicator />}>
      <BulletinDataContainer parsedLocale={parsedLocale} />
    </Suspense>
  );
}
