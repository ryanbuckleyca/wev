import { Suspense } from 'react';
import { routing } from '@/i18n/routing';
import { parseLocale } from '@/lib/resolve-skill-labels';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import { rolesIncludeAdmin } from '@/lib/auth';
import {
  fetchBulletinJobs,
  fetchServerBookmarks,
  fetchServerMatchData,
  fetchServerProfile,
} from '@/lib/bulletin/server-data';
import BulletinPageClient from '@/components/BulletinPageClient';
import BulletinPageSkeleton from '@/components/BulletinPageSkeleton';

// Renders the data fetch independently inside a Suspense boundary
async function BulletinDataContainer({ parsedLocale }: { parsedLocale: 'en' | 'fr' }) {
  const authPromise = getRequestUser();
  const bulletinDataPromise = fetchBulletinJobs(parsedLocale);
  const auth = await authPromise;

  let isAdmin = false;
  let initialUserId: string | null = null;
  let initialMatchData = undefined;
  let initialBookmarkedJobIds = undefined;
  let initialProfile = null;

  if (auth.ok) {
    initialUserId = auth.user.id;
    const [rolesResult, matchData, bookmarkedJobIds, profile] = await Promise.all([
      fetchUserRolesFromService(auth.user.id),
      fetchServerMatchData(auth.user.id),
      fetchServerBookmarks(auth.user.id),
      fetchServerProfile(auth.user.id),
    ]);
    const resolvedRoles = rolesResult.ok ? rolesResult.roles : ['user'];
    isAdmin = rolesIncludeAdmin(resolvedRoles);
    initialMatchData = matchData;
    initialBookmarkedJobIds = bookmarkedJobIds;
    initialProfile = profile;
  }

  const bulletinData = await bulletinDataPromise;

  return (
    <BulletinPageClient
      initialJobs={bulletinData.jobs}
      initialScrapeTime={bulletinData.lastScrapeTime}
      initialSkillLabels={bulletinData.skillLabels}
      initialUserId={initialUserId}
      isLoggedIn={auth.ok}
      isAdmin={isAdmin}
      initialMatchData={initialMatchData}
      initialBookmarkedJobIds={initialBookmarkedJobIds}
      initialProfile={initialProfile}
    />
  );
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const validLocales = routing.locales as readonly string[];
  const locale = validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const parsedLocale = parseLocale(locale);

  // The outer page renders the instant HTML layout shell immediately.
  // The BulletinDataContainer loads the cached jobs payload and any authenticated
  // user metadata in parallel inside the Suspense boundary.
  return (
    <Suspense fallback={<BulletinPageSkeleton />}>
      <BulletinDataContainer parsedLocale={parsedLocale} />
    </Suspense>
  );
}
