import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Leaf1Solid } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { fetchOrganizationDetail } from '@/lib/organizations/server-data';
import { ORG_JOBS_PER_PAGE } from '@/lib/organizations/constants';
import OrganizationJobRow from '@/components/OrganizationJobRow';
import SimplePagination from '@/components/SimplePagination';

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale, slug } = await params;
  const typedLocale = locale === 'fr' ? 'fr' : 'en';
  const data = await fetchOrganizationDetail(slug, 1, typedLocale);

  if (!data) return {};

  return {
    title: data.org.name,
    description: data.org.description || undefined,
  };
}

export default async function OrganizationDetailPage({ params, searchParams }: PageProps) {
  const { locale, slug } = await params;
  const resolvedSearchParams = await searchParams;
  const t = await getTranslations({ locale, namespace: 'organizations' });
  const typedLocale = locale === 'fr' ? 'fr' : 'en';

  const page =
    typeof resolvedSearchParams.page === 'string'
      ? parseInt(resolvedSearchParams.page, 10)
      : 1;

  const data = await fetchOrganizationDetail(slug, page, typedLocale);

  if (!data) {
    notFound();
  }

  const { org, jobs, total } = data;
  const totalPages = Math.ceil(total / ORG_JOBS_PER_PAGE);

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        
        {/* Header Section */}
        <div className="bg-card border border-border rounded-wev-card p-6 sm:p-8 mb-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-foreground">{org.name}</h1>
                {org.is_sse && (
                  <span className="flex-shrink-0" role="img" aria-label={t('sseBadgeLabel')}>
                    <Lineicons icon={Leaf1Solid} size={24} className="text-wev-success" />
                  </span>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-2 text-muted-foreground mt-4">
                {org.location && (
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">{t('location')}:</span> {org.location}
                  </div>
                )}
                
                {org.website && (
                  <a
                    href={org.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    {t('visitWebsite')}
                  </a>
                )}
              </div>
            </div>
          </div>
          
          {org.description && (
            <div className="mt-8 pt-8 border-t border-border">
              <h2 className="text-lg font-semibold text-foreground mb-3">{t('description')}</h2>
              <p className="text-foreground whitespace-pre-wrap leading-relaxed">{org.description}</p>
            </div>
          )}
        </div>

        {/* Jobs Section */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground mb-6">
            {t('jobs', { count: total })}
          </h2>
          
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
        
      </div>
    </main>
  );
}
