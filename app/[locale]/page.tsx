import { routing } from '@/i18n/routing';
import { parseLocale } from '@/lib/resolve-skill-labels';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import { rolesIncludeAdmin } from '@/lib/auth';
import {
  fetchBulletinJobs,
  fetchServerMatchData,
  fetchServerBookmarks,
  fetchServerProfile,
} from '@/lib/bulletin/server-data';
import BulletinPageClient from '@/components/BulletinPageClient';

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t0 = performance.now();

  const { locale: rawLocale } = await params;
  const validLocales = routing.locales as readonly string[];
  const locale = validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const parsedLocale = parseLocale(locale);

  // ─── Start jobs & auth simultaneously (no sequential waterfall) ───────
  const jobsPromise = fetchBulletinJobs(parsedLocale);
  const authPromise = getRequestUser();

  const auth = await authPromise;
  const tAuth = performance.now();

  if (!auth.ok) {
    const bulletinData = await jobsPromise;
    const tJobs = performance.now();
    console.log(
      `[page] anon render — auth: ${(tAuth - t0).toFixed(0)}ms, jobs: ${(tJobs - t0).toFixed(0)}ms, total: ${(tJobs - t0).toFixed(0)}ms`,
    );
    return (
      <BulletinPageClient
        initialJobs={bulletinData.jobs}
        initialScrapeTime={bulletinData.lastScrapeTime}
        isLoggedIn={false}
        isAdmin={false}
      />
    );
  }

  const { user } = auth;

  // ─── All remaining fetches run in parallel (including the already-started jobs) ─
  const matchPromise = fetchServerMatchData(user.id);
  const bookmarkPromise = fetchServerBookmarks(user.id);
  const profilePromise = fetchServerProfile(user.id);
  const rolesPromise = fetchUserRolesFromService(user.id);

  const [bulletinData, matchData, bookmarkedJobIds, profile, rolesResult] =
    await Promise.all([
      jobsPromise,
      matchPromise,
      bookmarkPromise,
      profilePromise,
      rolesPromise,
    ]);

  const tAll = performance.now();
  console.log(
    `[page] authed render — auth: ${(tAuth - t0).toFixed(0)}ms, all-data: ${(tAll - t0).toFixed(0)}ms (jobs+match+bookmarks+profile+roles parallel)`,
  );

  const resolvedRoles = rolesResult.ok ? rolesResult.roles : ['user'];
  const isAdmin = rolesIncludeAdmin(resolvedRoles);

  // Filter match + bookmark data to only jobs that exist in the current dataset.
  const jobIdSet = new Set(bulletinData.jobs.map((j) => j.id));
  const filteredMatchData = Object.fromEntries(
    Object.entries(matchData).filter(([id]) => jobIdSet.has(id)),
  );
  const filteredBookmarks = bookmarkedJobIds.filter((id) => jobIdSet.has(id));

  return (
    <BulletinPageClient
      initialJobs={bulletinData.jobs}
      initialScrapeTime={bulletinData.lastScrapeTime}
      initialMatchData={filteredMatchData}
      initialBookmarkedJobIds={filteredBookmarks}
      initialProfile={profile}
      isLoggedIn={true}
      isAdmin={isAdmin}
    />
  );
}
