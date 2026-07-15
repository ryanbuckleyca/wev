import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/require-admin-page';
import { supabaseServer } from '@/lib/supabase-server';
import { ADMIN_ORGS_PER_PAGE } from '@/lib/organizations/constants';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import { logger } from '@/lib/logger';
import PageLayout from '@/components/PageLayout';
import SseBadge from '@/components/SseBadge';
import UrlSyncedPagination from '@/components/UrlSyncedPagination';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}

function parsePage(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.organizations' });
  return { title: t('listTitle') };
}

export default async function AdminOrganizationsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: rawPage } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'admin.organizations' });
  const tOrgs = await getTranslations({ locale, namespace: 'organizations' });

  await requireAdminPage(locale);

  const { count: totalCount, error: countError } = await supabaseServer
    .from('organizations')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    logger.error({ err: countError }, 'Failed to count organizations for admin list');
  }

  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_ORGS_PER_PAGE));
  const page = Math.min(parsePage(rawPage), totalPages);
  const from = (page - 1) * ADMIN_ORGS_PER_PAGE;
  const to = from + ADMIN_ORGS_PER_PAGE - 1;

  const { data: organizations, error } = await supabaseServer
    .from('organizations')
    .select('id, name, slug, type, is_sse, location, created_at')
    .order('name', { ascending: true })
    .range(from, to);

  if (error) {
    logger.error({ err: error }, 'Failed to fetch organizations for admin list');
  }

  const orgs = organizations || [];
  const loadFailed = Boolean(countError || error);

  return (
    <PageLayout maxWidth="lg">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t('listTitle')}</h1>
        <Link
          href={`/${locale}/admin/organizations/new`}
          className={cn(buttonVariants({ variant: 'default' }))}
        >
          {t('actions.addNew')}
        </Link>
      </div>

      {loadFailed && (
        <div className="mb-6 p-4 rounded bg-destructive/10 text-destructive border border-destructive/20">
          {t('errors.loadFailed')}
        </div>
      )}

      {!loadFailed && orgs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t('noOrganizations')}</p>
        </div>
      ) : !loadFailed ? (
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
                  {t('columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr
                  key={org.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/organizations/${org.slug}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{org.slug}</td>
                  <td className="px-4 py-3 text-sm">
                    {getOrganizationTypeLabel(org.type, tOrgs) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{org.location || '—'}</td>
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
                    <Link
                      href={`/${locale}/admin/organizations/${org.id}/edit`}
                      className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                    >
                      {t('edit')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loadFailed && (
        <div className="mt-6">
          <UrlSyncedPagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            itemsPerPage={ADMIN_ORGS_PER_PAGE}
            singularKey="organizations.organization"
            pluralKey="organizations.organizations"
          />
        </div>
      )}
    </PageLayout>
  );
}
