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
  const { locale: rawLocale } = await params;
  const validLocales = routing.locales as readonly string[];
  const locale = validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const parsedLocale = parseLocale(locale);

  // ─── Public jobs data (server-side cached, ~1ms on warm cache) ────────────
  const bulletinData = await fetchBulletinJobs(parsedLocale);

  // ─── User session (reads cookie — no network RTT) ─────────────────────────
  const auth = await getRequestUser();

  if (!auth.ok) {
    // Anonymous visitor: ship the page with jobs only, no user data.
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

  // ─── All user data fetched in parallel ────────────────────────────────────
  // matchData / bookmarks run without a jobId filter so they are fully parallel
  // with no sequential dependency on each other.
  const [matchData, bookmarkedJobIds, profile, rolesResult] = await Promise.all([
    fetchServerMatchData(user.id),
    fetchServerBookmarks(user.id),
    fetchServerProfile(user.id),
    fetchUserRolesFromService(user.id),
  ]);

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
