import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { fetchOrganizationIndex } from '@/lib/organizations/server-data';
import OrganizationIndexView from '@/components/OrganizationIndexView';
import SimplePagination from '@/components/SimplePagination';
import { ORG_JOBS_PER_PAGE } from '@/lib/organizations/constants';
import { SITE_CONFIG } from '@/lib/site-config';

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

  if (page > totalPages && totalPages > 0) {
    redirect(`/${locale}/organizations?page=${totalPages}`);
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <header className="mb-8">
          <Image
            src={SITE_CONFIG.logotypeUrl}
            alt={t('indexTitle')}
            width={100}
            height={40}
            unoptimized
            className="main-logo wev-logotype w-[100px] h-auto mb-2"
            priority
          />
          <h1 className="text-3xl font-bold text-foreground">{t('indexTitle')}</h1>
        </header>

        <OrganizationIndexView orgs={orgs} locale={locale} t={t} />

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
