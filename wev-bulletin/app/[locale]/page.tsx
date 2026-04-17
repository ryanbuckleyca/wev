import { Suspense } from 'react';
import { routing } from '@/i18n/routing';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import { rolesIncludeAdmin } from '@/lib/auth';
import {
  buildInitialBulletinData,
  fetchServerBookmarks,
  fetchServerMatchData,
  fetchServerProfile,
  type BulletinSearchParams,
  type SerializedMatchData,
} from '@/lib/bulletin/server-data';
import BulletinPageContentSkeleton from '@/components/BulletinPageContentSkeleton';
import BulletinPageClient from '@/components/BulletinPageClient';
import BulletinPageScaffold from '@/components/BulletinPageScaffold';
import { parseLocale } from '@/lib/resolve-skill-labels';

// Renders auth/profile bootstrap independently inside a Suspense boundary.
async function BulletinDataContainer({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<BulletinSearchParams>;
}) {
  const [auth, resolvedParams, resolvedSearchParams] = await Promise.all([
    getRequestUser(),
    params,
    searchParams,
  ]);
  const validLocales = routing.locales as readonly string[];
  const locale = validLocales.includes(resolvedParams.locale)
    ? resolvedParams.locale
    : routing.defaultLocale;
  const parsedLocale = parseLocale(locale);

  let isAdmin = false;
  let initialUserId: string | null = null;
  let initialProfile: Awaited<ReturnType<typeof fetchServerProfile>> = null;
  let initialMatchData: SerializedMatchData | undefined = undefined;
  let initialBookmarkedJobIds: string[] | undefined = undefined;

  if (auth.ok) {
    initialUserId = auth.user.id;
    const [rolesResult, profile, matchData, bookmarkedJobIds] = await Promise.all([
      fetchUserRolesFromService(auth.user.id),
      fetchServerProfile(auth.user.id),
      fetchServerMatchData(auth.user.id),
      fetchServerBookmarks(auth.user.id),
    ]);
    const resolvedRoles = rolesResult.ok ? rolesResult.roles : ['user'];
    isAdmin = rolesIncludeAdmin(resolvedRoles);
    initialProfile = profile;
    initialMatchData = matchData;
    initialBookmarkedJobIds = bookmarkedJobIds;
  }

  const initialBulletinData = await buildInitialBulletinData({
    locale: parsedLocale,
    searchParams: resolvedSearchParams,
    userId: initialUserId,
    profile: initialProfile,
    matchData: initialMatchData,
    bookmarkedJobIds: initialBookmarkedJobIds,
  });

  return (
    <BulletinPageClient
      initialJobs={initialBulletinData.jobs}
      initialScrapeTime={initialBulletinData.scrapeTime}
      initialSkillLabels={initialBulletinData.skillLabels}
      initialUserId={initialUserId}
      isLoggedIn={auth.ok}
      isAdmin={isAdmin}
      initialMatchData={initialBulletinData.matchData}
      initialBookmarkedJobIds={initialBulletinData.bookmarkedJobIds}
      initialProfile={initialProfile}
      initialFilteredJobsCount={initialBulletinData.filteredJobsCount}
      initialTotalJobsCount={initialBulletinData.totalJobsCount}
      initialTotalPages={initialBulletinData.totalPages}
    />
  );
}

export default function Home({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<BulletinSearchParams>;
}) {
  // Render the shell immediately and stream auth/profile bootstrap inside it.
  // The jobs payload still hydrates from /api/bulletin on the client to avoid
  // inflating the initial HTML/RSC response.
  return (
    <BulletinPageScaffold>
      <Suspense fallback={<BulletinPageContentSkeleton />}>
        <BulletinDataContainer params={params} searchParams={searchParams} />
      </Suspense>
    </BulletinPageScaffold>
  );
}
