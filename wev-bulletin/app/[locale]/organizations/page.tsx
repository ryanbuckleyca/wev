import { getTranslations } from 'next-intl/server';
import { fetchOrganizationIndex } from '@/lib/organizations/server-data';
import OrganizationIndexView from '@/components/OrganizationIndexView';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organizations' });

  return {
    title: t('indexTitle'),
  };
}

export default async function OrganizationsIndexPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organizations' });
  const orgs = await fetchOrganizationIndex();

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-3xl font-bold text-foreground mb-8">{t('indexTitle')}</h1>

        <OrganizationIndexView orgs={orgs} />
      </div>
    </main>
  );
}
