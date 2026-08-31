import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/require-admin-page';
import { supabaseServer } from '@/lib/supabase-server';
import { ADMIN_ORGS_PER_PAGE } from '@/lib/organizations/constants';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import { ORG_SKIP_REASON_IGNORED } from '@/lib/organizations/assessment-review';
import { logger } from '@/lib/logger';
import PageLayout from '@/components/PageLayout';
import SseBadge from '@/components/SseBadge';
import UrlSyncedPagination from '@/components/UrlSyncedPagination';
import OrgReviewActions from '@/components/admin/OrgReviewActions';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; review?: string }>;
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
  const { page: rawPage, review: rawReview } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'admin.organizations' });
  const tOrgs = await getTranslations({ locale, namespace: 'organizations' });

  await requireAdminPage(locale);

  const reviewOnly = rawReview === '1';

  const [
    { count: allCount, error: allCountError },
    { count: reviewCount, error: reviewCountError },
  ] = await Promise.all([
    supabaseServer.from('organizations').select('id', { count: 'exact', head: true }),
    supabaseServer
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .not('assessment_skip_reason', 'is', null)
      .neq('assessment_skip_reason', ORG_SKIP_REASON_IGNORED),
  ]);

  if (allCountError || reviewCountError) {
    logger.error(
      { err: allCountError ?? reviewCountError },
      'Failed to count organizations for admin list',
    );
  }

  const needsReviewCount = reviewCount ?? 0;
  const total = (reviewOnly ? reviewCount : allCount) ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_ORGS_PER_PAGE));
  const page = Math.min(parsePage(rawPage), totalPages);
  const from = (page - 1) * ADMIN_ORGS_PER_PAGE;
  const to = from + ADMIN_ORGS_PER_PAGE - 1;

  let query = supabaseServer
    .from('organizations')
    .select('id, name, slug, type, is_sse, location, created_at, assessment_skip_reason');

  if (reviewOnly) {
    query = query
      .not('assessment_skip_reason', 'is', null)
      .neq('assessment_skip_reason', ORG_SKIP_REASON_IGNORED);
  }

  const { data: organizations, error } = await query
    .order('name', { ascending: true })
    .range(from, to);

  if (error) {
    logger.error({ err: error }, 'Failed to fetch organizations for admin list');
  }

  const orgs = organizations || [];
  const loadFailed = Boolean(allCountError || reviewCountError || error);

  // Unknown reasons still render something useful: the scraper may add a reason
  // before the translations catch up.
  const reasonLabel = (reason: string | null) =>
    reason
      ? t.has(`skipReasons.${reason}`)
        ? t(`skipReasons.${reason}`)
        : reason
      : t('skipReasons.unknown');

  return (
    // xl, not the lg default: this table carries up to seven columns, and at
    // lg the Actions buttons wrap on every row even on a wide screen.
    <PageLayout maxWidth="xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t('listTitle')}</h1>
        <Link
          href={`/${locale}/admin/organizations/new`}
          className={cn(buttonVariants({ variant: 'default' }))}
        >
          {t('actions.addNew')}
        </Link>
      </div>

      <div className="flex gap-2 mb-6">
        <Link
          href={`/${locale}/admin/organizations`}
          className={cn(
            buttonVariants({ variant: reviewOnly ? 'secondary' : 'default', size: 'sm' }),
          )}
        >
          {t('filters.all')}
        </Link>
        <Link
          href={`/${locale}/admin/organizations?review=1`}
          className={cn(
            buttonVariants({ variant: reviewOnly ? 'default' : 'secondary', size: 'sm' }),
          )}
        >
          {needsReviewCount > 0
            ? t('filters.needsReviewCount', { count: needsReviewCount })
            : t('filters.needsReview')}
        </Link>
      </div>

      {loadFailed && (
        <div className="mb-6 p-4 rounded bg-destructive/10 text-destructive border border-destructive/20">
          {t('errors.loadFailed')}
        </div>
      )}

      {!loadFailed && orgs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{reviewOnly ? t('noNeedsReview') : t('noOrganizations')}</p>
        </div>
      ) : !loadFailed ? (
        // overflow-x-auto, not overflow-hidden: a table too wide to fit should
        // scroll rather than have its Actions column clipped off.
        <div className="bg-card border border-border rounded-wev-card overflow-x-auto">
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
                {reviewOnly && (
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                    {t('columns.reason')}
                  </th>
                )}
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
                  {reviewOnly && (
                    // Bounded so a long reason wraps instead of starving the
                    // Actions column of width.
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-[14rem] align-top">
                      {reasonLabel(org.assessment_skip_reason)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-center">
                    {org.is_sse ? (
                      <div className="inline-flex">
                        <SseBadge label={t('sseBadge')} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    <div className="flex flex-wrap gap-2 items-center justify-end">
                      <Link
                        href={`/${locale}/admin/organizations/${org.id}/edit`}
                        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                      >
                        {t('edit')}
                      </Link>
                      {reviewOnly && (
                        <OrgReviewActions
                          orgId={org.id}
                          currentReason={org.assessment_skip_reason}
                          locale={locale}
                          className="contents"
                        />
                      )}
                    </div>
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
