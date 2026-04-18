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
} from '@/lib/bulletin/server-data';
import BulletinPageClient from '@/components/BulletinPageClient';
import BulletinPageScaffold from '@/components/BulletinPageScaffold';
import { parseLocale } from '@/lib/resolve-skill-labels';

/**
 * Resolves locale from the route params promise.
 * Extracted so auth and locale resolution can run in parallel.
 */
async function resolveLocale(params: Promise<{ locale: string }>): Promise<'en' | 'fr'> {
  const { locale: rawLocale } = await params;
  const validLocales = routing.locales as readonly string[];
  const locale = validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale;
  return parseLocale(locale);
}

/**
 * Fetches all authenticated user metadata in a single parallel batch.
 * Returns null for unauthenticated users immediately — no wasted DB calls.
 */
async function fetchAuthenticatedUserData(userId: string) {
  const [rolesResult, profile, matchData, bookmarkedJobIds] = await Promise.all([
    fetchUserRolesFromService(userId),
    fetchServerProfile(userId),
    fetchServerMatchData(userId),
    fetchServerBookmarks(userId),
  ]);

  return {
    isAdmin: rolesIncludeAdmin(rolesResult.ok ? rolesResult.roles : ['user']),
    profile,
    matchData,
    bookmarkedJobIds,
  };
}

// Renders auth/profile bootstrap independently inside a Suspense boundary.
async function BulletinDataContainer({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<BulletinSearchParams>;
}) {
  // Resolve auth, locale, and searchParams in parallel — no sequential waterfall.
  const [auth, parsedLocale, resolvedSearchParams] = await Promise.all([
    getRequestUser(),
    resolveLocale(params),
    searchParams,
  ]);

  // For unauthenticated users, skip all user-metadata DB calls entirely.
  const userId = auth.ok ? auth.user.id : null;
  const userData = userId ? await fetchAuthenticatedUserData(userId) : null;

  const initialBulletinData = await buildInitialBulletinData({
    locale: parsedLocale,
    searchParams: resolvedSearchParams,
    userId,
    profile: userData?.profile ?? null,
    matchData: userData?.matchData,
    bookmarkedJobIds: userData?.bookmarkedJobIds,
  });

  return (
    <BulletinPageClient
      initialJobs={initialBulletinData.jobs}
      initialScrapeTime={initialBulletinData.scrapeTime}
      initialSkillLabels={initialBulletinData.skillLabels}
      initialUserId={userId}
      isLoggedIn={auth.ok}
      isAdmin={userData?.isAdmin ?? false}
      initialMatchData={initialBulletinData.matchData}
      initialBookmarkedJobIds={initialBulletinData.bookmarkedJobIds}
      initialProfile={userData?.profile ?? null}
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
      <Suspense fallback={null}>
        <BulletinDataContainer params={params} searchParams={searchParams} />
      </Suspense>
    </BulletinPageScaffold>
  );
}
