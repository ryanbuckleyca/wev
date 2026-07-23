import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getOrganizationBySlug, getOrganizationJobs } from '@/lib/organizations/server-data';
import { computeOrgValueMatch } from '@/lib/organizations/value-match';
import { ORG_JOBS_PER_PAGE } from '@/lib/organizations/constants';
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

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const org = await getOrganizationBySlug(slug);

  if (!org) return {};

  return {
    title: org.name,
    description: org.description || undefined,
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
  });
  const totalPages = Math.max(1, Math.ceil(total / ORG_JOBS_PER_PAGE));

  if (page > totalPages && page > 1) {
    notFound();
  }

  const baseUrl = `/${locale}/organizations/${slug}`;

  return (
    <PageLayout maxWidth="lg">
      <OrganizationProfileHeader
        org={org}
        t={t}
        editHref={isAdmin ? `/${locale}/admin/organizations/${org.id}/edit` : null}
        editLabel={isAdmin ? tAdmin('edit') : undefined}
        valueMatch={valueMatch}
        sectorLabel={org.sector_id ? tSectors(`${org.sector_id}.label`) : t('noSector')}
        isLoggedIn={Boolean(user)}
      />

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground mb-6">{t('jobs', { count: total })}</h2>

        {jobs.length === 0 ? (
          <div className="bg-muted p-8 rounded-wev-card text-center text-muted-foreground">
            {t('noJobsForOrg')}
          </div>
        ) : (
          <OrganizationJobsList jobs={jobs} />
        )}

        {total > ORG_JOBS_PER_PAGE && (
          <SimplePagination currentPage={page} totalPages={totalPages} baseUrl={baseUrl} />
        )}
      </div>
    </PageLayout>
  );
}
