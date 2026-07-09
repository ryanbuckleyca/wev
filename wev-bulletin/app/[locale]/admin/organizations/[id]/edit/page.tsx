import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireAdminPage } from '@/lib/auth/require-admin-page';
import { supabaseServer } from '@/lib/supabase-server';
import { ORG_ADMIN_FORM_COLUMNS } from '@/lib/organizations/constants';
import { parseOrgId } from '@/lib/organizations/parse-org-id';
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

  await requireAdminPage(locale);

  const orgId = parseOrgId(id);
  if (!orgId) {
    notFound();
  }

  const { data: org, error } = await supabaseServer
    .from('organizations')
    .select(ORG_ADMIN_FORM_COLUMNS)
    .eq('id', orgId)
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
