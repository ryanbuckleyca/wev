import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Leaf1Solid } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
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

  // SSE filter — default false on detail page (show all jobs, let user opt in)
  const sseOnly = resolvedSearchParams.sse === 'true';

  const org = await getOrganizationBySlug(slug);

  if (!org) {
    notFound();
  }

  const { jobs, total, totalAvailable } = await getOrganizationJobs({ orgId: org.id, page, sseOnly });
  const totalPages = Math.ceil(total / ORG_JOBS_PER_PAGE);

  if (page > totalPages && page > 1) {
    notFound();
  }

  const baseUrl = `/${locale}/organizations/${slug}`;
  // Extra params forwarded to pagination links so SSE filter survives page nav
  const paginationParams: Record<string, string> = sseOnly ? { sse: 'true' } : {};

  // Toggle href: flipping SSE always resets to page 1
  const sseToggleHref = sseOnly ? baseUrl : `${baseUrl}?sse=true`;

  // Heading: show "X / Y active jobs" when SSE filter is active, otherwise plain count
  const jobsHeading =
    sseOnly && totalAvailable !== total
      ? t('jobsFiltered', { filtered: total, total: totalAvailable })
      : t('jobs', { count: totalAvailable });

  return (
    <PageLayout maxWidth="lg">
      <OrganizationProfileHeader org={org} t={t} />

      {/* Jobs Section */}
      <div className="space-y-4">
        {/* Header row: count + SSE toggle */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-foreground">{jobsHeading}</h2>

          <Link
            href={sseToggleHref}
            aria-pressed={sseOnly}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors whitespace-nowrap ${
              sseOnly
                ? 'bg-wev-success/10 border-wev-success text-wev-success hover:bg-wev-success/20'
                : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
            }`}
          >
            <Lineicons
              icon={Leaf1Solid}
              size={14}
              className={sseOnly ? 'text-wev-success' : 'text-muted-foreground'}
              aria-hidden
            />
            {t('showOnlySseJobs')}
          </Link>
        </div>

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
            baseUrl={baseUrl}
            extraParams={paginationParams}
          />
        )}
      </div>
    </PageLayout>
  );
}
