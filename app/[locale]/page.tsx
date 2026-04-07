import { Suspense, type ComponentProps } from 'react';
import BulletinPageClient from '@/components/BulletinPageClient';
import LoadingIndicator from '@/components/LoadingIndicator';
import { rolesIncludeAdmin } from '@/lib/auth';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import { fetchBulletinJobs } from '@/lib/bulletin/server-data';
import { routing } from '@/i18n/routing';
import { parseLocale } from '@/lib/resolve-skill-labels';

type BulletinPageClientProps = ComponentProps<typeof BulletinPageClient>;

async function getInitialBulletinProps(
  parsedLocale: 'en' | 'fr',
): Promise<
  Pick<
    BulletinPageClientProps,
    'initialError' | 'initialJobs' | 'initialScrapeTime' | 'initialSkillLabels'
  >
> {
  try {
    const bulletinData = await fetchBulletinJobs(parsedLocale);

    return {
      initialError: null,
      initialJobs: bulletinData.jobs,
      initialScrapeTime: bulletinData.lastScrapeTime,
      initialSkillLabels: bulletinData.skillLabels,
    };
  } catch (error) {
    return {
      initialError: error instanceof Error ? error.message : 'Failed to load bulletin data',
      initialJobs: [],
      initialScrapeTime: null,
      initialSkillLabels: {},
    };
  }
}

// Renders the data fetch independently inside a Suspense boundary.
async function BulletinDataContainer({ parsedLocale }: { parsedLocale: 'en' | 'fr' }) {
  // Move all blocking queries inside the Suspense boundary so they don't delay
  // the initial HTML stream.
  const auth = await getRequestUser();

  let isAdmin = false;
  if (auth.ok) {
    const rolesResult = await fetchUserRolesFromService(auth.user.id);
    const resolvedRoles = rolesResult.ok ? rolesResult.roles : ['user'];
    isAdmin = rolesIncludeAdmin(resolvedRoles);
  }

  const initialBulletinProps = await getInitialBulletinProps(parsedLocale);

  return (
    <BulletinPageClient {...initialBulletinProps} isLoggedIn={auth.ok} isAdmin={isAdmin} />
  );
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const validLocales = routing.locales as readonly string[];
  const locale = validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const parsedLocale = parseLocale(locale);

  return (
    <Suspense fallback={<LoadingIndicator />}>
      <BulletinDataContainer parsedLocale={parsedLocale} />
    </Suspense>
  );
}
