import { redirect, notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireAdminSession } from '@/lib/auth/require-admin';
import { supabaseServer } from '@/lib/supabase-server';
import PageLayout from '@/components/PageLayout';
import OrgAdminForm from '@/components/OrgAdminForm';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.organizations' });
  return { title: t('editTitle') };
}

export default async function EditOrganizationPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.organizations' });

  // Enforce admin authorization
  const authResult = await requireAdminSession();
  if (!authResult.ok) {
    return redirect(`/${locale}/login`);
  }

  // Fetch organization by id
  const { data: org, error } = await supabaseServer
    .from('organizations')
    .select('*')
    .eq('id', parseInt(id, 10))
    .single();

  if (error || !org) {
    console.error('Failed to fetch organization:', error);
    notFound();
  }

  return (
    <PageLayout maxWidth="md">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t('editTitle')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('editDescription', { name: org.name })}
        </p>
      </div>

      <OrgAdminForm locale={locale} initialValues={org} />
    </PageLayout>
  );
}
