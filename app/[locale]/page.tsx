import { routing } from '@/i18n/routing';
import { parseLocale } from '@/lib/resolve-skill-labels';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import { rolesIncludeAdmin } from '@/lib/auth';
import { fetchBulletinJobs } from '@/lib/bulletin/server-data';
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

  // ─── Fast path: cached jobs + cookie auth run in parallel ─────────────
  // Jobs are cached server-side for 5 min (unstable_cache) → ~1ms on warm hit.
  // Auth reads the cookie → no external network call.
  // User-specific data (matches, bookmarks, profile) loads client-side after
  // hydration to avoid blocking the HTML response on Supabase round-trips.
  const [bulletinData, auth] = await Promise.all([
    fetchBulletinJobs(parsedLocale),
    getRequestUser(),
  ]);

  if (!auth.ok) {
    return (
      <BulletinPageClient
        initialJobs={bulletinData.jobs}
        initialScrapeTime={bulletinData.lastScrapeTime}
        isLoggedIn={false}
        isAdmin={false}
      />
    );
  }

  // Roles is a single tiny query — worth blocking on so the admin UI renders
  // correctly on first paint (avoids a flash of the non-admin view).
  const rolesResult = await fetchUserRolesFromService(auth.user.id);
  const resolvedRoles = rolesResult.ok ? rolesResult.roles : ['user'];
  const isAdmin = rolesIncludeAdmin(resolvedRoles);

  return (
    <BulletinPageClient
      initialJobs={bulletinData.jobs}
      initialScrapeTime={bulletinData.lastScrapeTime}
      isLoggedIn={true}
      isAdmin={isAdmin}
    />
  );
}
