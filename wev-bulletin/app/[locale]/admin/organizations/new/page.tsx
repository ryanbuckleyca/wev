import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireAdminSession } from '@/lib/auth/require-admin';
import PageLayout from '@/components/PageLayout';
import OrgAdminForm from '@/components/OrgAdminForm';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.organizations' });
  return { title: t('createTitle') };
}

export default async function NewOrganizationPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.organizations' });

  // Enforce admin authorization
  const authResult = await requireAdminSession();
  if (!authResult.ok) {
    return redirect(`/${locale}/login`);
  }

  return (
    <PageLayout maxWidth="md">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t('createTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('createDescription')}</p>
      </div>

      <OrgAdminForm locale={locale} />
    </PageLayout>
  );
}
