import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { requireAdminSession } from '@/lib/auth/require-admin';
import { supabaseServer } from '@/lib/supabase-server';
import PageLayout from '@/components/PageLayout';
import Button from '@/components/Button';
import SseBadge from '@/components/SseBadge';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.organizations' });
  return { title: t('listTitle') };
}

export default async function AdminOrganizationsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.organizations' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  // Enforce admin authorization
  const authResult = await requireAdminSession();
  if (!authResult.ok) {
    return redirect(`/${locale}/login`);
  }

  // Fetch all organizations
  const { data: organizations, error } = await supabaseServer
    .from('organizations')
    .select('id, name, slug, type, is_sse, location, created_at')
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch organizations:', error);
  }

  const orgs = organizations || [];

  return (
    <PageLayout maxWidth="lg">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t('listTitle')}</h1>
        <Link href={`/${locale}/admin/organizations/new`}>
          <Button variant="primary">{t('actions.addNew')}</Button>
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded bg-destructive/10 text-destructive border border-destructive/20">
          {t('errors.loadFailed')}
        </div>
      )}

      {orgs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t('noOrganizations')}</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-wev-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                  {t('columns.name')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                  {t('columns.slug')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                  {t('columns.type')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                  {t('columns.location')}
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">
                  {t('columns.sse')}
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                  {tCommon('actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-b border-border last:border-b-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/organizations/${org.slug}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                    {org.slug}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {org.type
                      ? t.has(`types.${org.type}`)
                        ? t(`types.${org.type}`)
                        : org.type
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {org.location || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {org.is_sse ? (
                      <div className="inline-flex">
                        <SseBadge label={t('sseBadge')} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/${locale}/admin/organizations/${org.id}/edit`}>
                      <Button size="sm" variant="secondary">
                        {tCommon('edit')}
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-sm text-muted-foreground">
        <p>
          {t('totalCount', { count: orgs.length })}
        </p>
      </div>
    </PageLayout>
  );
}
