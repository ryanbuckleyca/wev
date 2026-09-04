import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getOrganizationBySlug, getOrganizationJobs } from '@/lib/organizations/server-data';
import { computeOrgValueMatch } from '@/lib/organizations/value-match';
import { ORG_JOBS_PER_PAGE } from '@/lib/organizations/constants';
import {
  activityWindowToDays,
  parseOrgJobsActivityWindow,
  type ActivityWindow,
} from '@/lib/organizations/params';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { rolesIncludeAdmin } from '@/lib/auth';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import { fetchServerProfile } from '@/lib/bulletin/server-data';
import { OrganizationJobsList } from '@/components/OrganizationJobRow';
import OrganizationProfileHeader from '@/components/OrganizationProfileHeader';
import SimplePagination from '@/components/SimplePagination';
import PageLayout from '@/components/PageLayout';

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const JOB_ACTIVITY_OPTIONS: ActivityWindow[] = ['28d', '90d', 'all'];

export async function generateMetadata({ params }: PageProps) {
  const { locale, slug } = await params;
  const org = await getOrganizationBySlug(slug);

  if (!org) return {};

  const { pickOrgLocalizedText } = await import('@/lib/organizations/localized');

  return {
    title: org.name,
    description: pickOrgLocalizedText(org, 'description', locale) || undefined,
  };
}

export default async function OrganizationDetailPage({ params, searchParams }: PageProps) {
  const { locale, slug } = await params;
  const resolvedSearchParams = await searchParams;
  const t = await getTranslations({ locale, namespace: 'organizations' });
  const tAdmin = await getTranslations({ locale, namespace: 'admin.organizations' });
  const tSectors = await getTranslations({ locale, namespace: 'taxonomy.sectors' });

  const parsedPage =
    typeof resolvedSearchParams.page === 'string' ? parseInt(resolvedSearchParams.page, 10) : 1;
  const page = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;

  const activityRaw =
    typeof resolvedSearchParams.activity === 'string' ? resolvedSearchParams.activity : undefined;
  const activityWindow = parseOrgJobsActivityWindow(activityRaw);
  const activityDays = activityWindowToDays(activityWindow);
  const showingRecentOnly = activityWindow === '28d';

  const org = await getOrganizationBySlug(slug);

  if (!org) {
    notFound();
  }

  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  let isAdmin = false;
  let valueMatch = null;
  if (user) {
    const [rolesResult, profile] = await Promise.all([
      fetchUserRolesFromService(user.id),
      fetchServerProfile(user.id),
    ]);
    isAdmin = rolesResult.ok && rolesIncludeAdmin(rolesResult.roles);
    if (profile) {
      valueMatch = computeOrgValueMatch(profile.values_rated, org.values_list, org.values_rated);
    }
  }

  const { jobs, total } = await getOrganizationJobs({
    orgId: org.id,
    page,
    locale,
    activityDays,
  });
  const totalPages = Math.max(1, Math.ceil(total / ORG_JOBS_PER_PAGE));

  if (page > totalPages && page > 1) {
    notFound();
  }

  const baseUrl = `/${locale}/organizations/${slug}`;
  const paginationExtra = activityWindow !== '28d' ? { activity: activityWindow } : undefined;

  const activityLabelKey = {
    '28d': 'jobsActivity28d',
    '90d': 'jobsActivity90d',
    all: 'jobsActivityAll',
  } as const;

  return (
    <PageLayout maxWidth="lg">
      <OrganizationProfileHeader
        org={org}
        locale={locale}
        t={t}
        editHref={isAdmin ? `/${locale}/admin/organizations/${org.id}/edit` : null}
        editLabel={isAdmin ? tAdmin('edit') : undefined}
        valueMatch={valueMatch}
        sectorLabel={
          org.sector_id && tSectors.has(`${org.sector_id}.label`)
            ? tSectors(`${org.sector_id}.label`)
            : null
        }
        isLoggedIn={Boolean(user)}
      />

      <div className="space-y-4">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-2xl font-bold text-foreground">
            {showingRecentOnly ? t('jobs', { count: total }) : t('jobsAll', { count: total })}
          </h2>
          <nav
            aria-label={t('jobsActivityLabel')}
            className="flex flex-wrap items-center gap-1 text-sm"
          >
            {JOB_ACTIVITY_OPTIONS.map((window) => {
              const selected = activityWindow === window;
              const href = window === '28d' ? baseUrl : `${baseUrl}?activity=${window}`;
              return (
                <Link
                  key={window}
                  href={href}
                  aria-current={selected ? 'page' : undefined}
                  className={
                    selected
                      ? 'rounded-wev-btn bg-foreground px-3 py-1.5 font-medium text-background'
                      : 'rounded-wev-btn px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }
                >
                  {t(activityLabelKey[window])}
                </Link>
              );
            })}
          </nav>
        </div>

        {jobs.length === 0 ? (
          <div className="bg-muted p-8 rounded-wev-card text-center text-muted-foreground">
            {showingRecentOnly ? t('noJobsForOrg') : t('noJobsForOrgAll')}
          </div>
        ) : (
          <OrganizationJobsList jobs={jobs} org={{ name: org.name, slug: org.slug }} />
        )}

        {total > ORG_JOBS_PER_PAGE && (
          <SimplePagination
            currentPage={page}
            totalPages={totalPages}
            baseUrl={baseUrl}
            extraParams={paginationExtra}
          />
        )}
      </div>
    </PageLayout>
  );
}
