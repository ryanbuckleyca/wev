import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getOrganizationBySlug, getOrganizationJobs } from '@/lib/organizations/server-data';
import { ORG_JOBS_PER_PAGE } from '@/lib/organizations/constants';
import OrganizationJobRow from '@/components/OrganizationJobRow';
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

  const parsedPage =
    typeof resolvedSearchParams.page === 'string' ? parseInt(resolvedSearchParams.page, 10) : 1;
  const page = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;

  const org = await getOrganizationBySlug(slug);

  if (!org) {
    notFound();
  }

  const { jobs, total } = await getOrganizationJobs(org.id, page);
  const totalPages = Math.ceil(total / ORG_JOBS_PER_PAGE);

  if (page > totalPages && page > 1) {
    notFound();
  }

  return (
    <PageLayout maxWidth="lg">
      <OrganizationProfileHeader org={org} t={t} />

      {/* Jobs Section */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground mb-6">{t('jobs', { count: total })}</h2>

        {jobs.length === 0 ? (
          <div className="bg-muted p-8 rounded-wev-card text-center text-muted-foreground">
            {t('noJobsForOrg')}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <OrganizationJobRow key={job.id} job={job} />
            ))}
          </div>
        )}

        {total > ORG_JOBS_PER_PAGE && (
          <SimplePagination
            currentPage={page}
            totalPages={totalPages}
            baseUrl={`/${locale}/organizations/${slug}`}
          />
        )}
      </div>
    </PageLayout>
  );
}
