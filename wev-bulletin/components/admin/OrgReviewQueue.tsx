import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/Button';
import SseBadge from '@/components/SseBadge';
import OrgReviewActions from '@/components/admin/OrgReviewActions';
import {
  ORG_ASSESSMENT_FIELDS,
  findMissingOrgFields,
  type OrgAssessmentSnapshot,
} from '@/lib/organizations/assessment-review';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import { cn } from '@/lib/utils';

export type OrgReviewQueueRow = OrgAssessmentSnapshot & {
  id: number;
  name: string;
  slug: string;
  location: string | null;
  is_sse: boolean | null;
  assessment_skip_reason: string | null;
};

interface OrgReviewQueueProps {
  orgs: OrgReviewQueueRow[];
  locale: string;
  reasonLabel: (reason: string | null) => string;
}

/**
 * Needs-review queue: identity + skip reason + assessed-field checklist.
 *
 * A table cannot surface the completeness criteria without becoming unreadable,
 * so each parked org is a stacked review row instead.
 */
export default async function OrgReviewQueue({ orgs, locale, reasonLabel }: OrgReviewQueueProps) {
  const t = await getTranslations({ locale, namespace: 'admin.organizations' });
  const tOrgs = await getTranslations({ locale, namespace: 'organizations' });

  return (
    <ul className="space-y-4">
      {orgs.map((org) => {
        const missing = new Set(findMissingOrgFields(org));
        const typeLabel = getOrganizationTypeLabel(org.type, tOrgs);

        return (
          <li key={org.id} className="border border-border rounded-wev-card bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/${locale}/organizations/${org.slug}`}
                    className="text-lg font-medium text-primary hover:underline"
                  >
                    {org.name}
                  </Link>
                  {org.is_sse ? <SseBadge label={t('sseBadge')} /> : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {[typeLabel, org.location].filter(Boolean).join(' · ') || '—'}
                </p>
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">{t('columns.reason')}: </span>
                  {reasonLabel(org.assessment_skip_reason)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 items-center sm:justify-end shrink-0">
                <Link
                  href={`/${locale}/admin/organizations/${org.id}/edit`}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                >
                  {t('edit')}
                </Link>
                <OrgReviewActions
                  orgId={org.id}
                  currentReason={org.assessment_skip_reason}
                  locale={locale}
                />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                {t('review.checklistHeading')}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                {ORG_ASSESSMENT_FIELDS.map((field) => {
                  const present = !missing.has(field);
                  const label = t(`review.missingFields.${field}`);
                  return (
                    <li
                      key={field}
                      className={cn(
                        'text-sm',
                        present ? 'text-muted-foreground' : 'text-foreground font-medium',
                      )}
                    >
                      {label}
                      {!present ? (
                        <span className="text-destructive font-normal">
                          {' '}
                          — {t('review.fieldMissing')}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
