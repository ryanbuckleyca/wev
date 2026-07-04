import { getTranslations } from 'next-intl/server';
import { fetchOrganizationIndex } from '@/lib/organizations/server-data';
import OrganizationIndexView from '@/components/OrganizationIndexView';
import SimplePagination from '@/components/SimplePagination';
import { ORG_JOBS_PER_PAGE } from '@/lib/organizations/constants';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organizations' });

  return {
    title: t('indexTitle'),
  };
}

export default async function OrganizationsIndexPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const t = await getTranslations({ locale, namespace: 'organizations' });

  const parsedPage =
    typeof resolvedSearchParams.page === 'string' ? parseInt(resolvedSearchParams.page, 10) : 1;
  const page = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;

  const { orgs, total } = await fetchOrganizationIndex(page);
  const totalPages = Math.ceil(total / ORG_JOBS_PER_PAGE);

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-3xl font-bold text-foreground mb-8">{t('indexTitle')}</h1>

        <OrganizationIndexView orgs={orgs} />

        {total > ORG_JOBS_PER_PAGE && (
          <SimplePagination
            currentPage={page}
            totalPages={totalPages}
            baseUrl={`/${locale}/organizations`}
          />
        )}
      </div>
    </main>
  );
}
