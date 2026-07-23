import { Leaf1Solid, Leaf1Outlined } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { safeUrl } from '@/lib/url';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import type { OrgRecord } from '@/lib/organizations/types';
import type { OrgValueMatch } from '@/lib/organizations/value-match';
import OrgValuesMatchFooter from './OrgValuesMatchFooter';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface Props {
  org: OrgRecord;
  /**
   * next-intl translation function scoped to the **'organizations'** namespace.
   * Must be created with `getTranslations({ locale, namespace: 'organizations' })`.
   */
  t: ReturnType<typeof useTranslations<'organizations'>>;
  editHref?: string | null;
  editLabel?: string;
  valueMatch?: OrgValueMatch | null;
  sectorLabel?: string | null;
  isLoggedIn?: boolean;
}

export default function OrganizationProfileHeader({
  org,
  t,
  editHref,
  editLabel,
  valueMatch = null,
  sectorLabel = null,
  isLoggedIn = false,
}: Props) {
  const websiteUrl = safeUrl(org.website);
  const sseDetails =
    org.sse_details && typeof org.sse_details === 'object' && !Array.isArray(org.sse_details)
      ? (org.sse_details as Record<string, unknown>)
      : null;
  const sseReasoning =
    sseDetails && typeof sseDetails.reasoning === 'string' ? sseDetails.reasoning : null;
  const values = org.values_list ?? [];

  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-foreground">{org.name}</h1>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-2 text-muted-foreground mt-4">
            {org.location && (
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">{t('location')}:</span> {org.location}
              </div>
            )}

            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                {t('visitWebsite')}
              </a>
            )}

            {org.type && (
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">{t('orgType')}:</span>{' '}
                {getOrganizationTypeLabel(org.type, t)}
              </div>
            )}

            {sectorLabel && (
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">{t('sector', { fallback: 'Sector' })}:</span>{' '}
                {sectorLabel}
              </div>
            )}
          </div>
        </div>

        {editHref && editLabel && (
          <Link
            href={editHref}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
          >
            {editLabel}
          </Link>
        )}
      </div>

      {values.length > 0 && (
        <OrgValuesMatchFooter
          values={values}
          valueScore={valueMatch?.valueScore ?? null}
          sharedValues={valueMatch?.sharedValues ?? []}
          isLoggedIn={isLoggedIn}
          className="mt-6 rounded-wev-card border border-border bg-muted px-4 py-3"
        />
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0" role="img" aria-label={t('sseBadgeLabel')}>
            <Lineicons
              icon={org.is_sse ? Leaf1Solid : Leaf1Outlined}
              size={16}
              className={org.is_sse ? 'text-wev-success' : 'text-muted-foreground'}
            />
          </span>
          <span className="text-sm text-muted-foreground">
            {org.is_sse ? t('sseYes') : t('sseNo')}
          </span>
          <a
            href="https://en.wikipedia.org/wiki/Social_solidarity_economy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {t('sseLearnMore')}
          </a>
        </div>
        {sseReasoning && (
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{sseReasoning}</p>
        )}
      </div>

      {org.description && (
        <div className="mt-8 pt-8 border-t border-border">
          <h2 className="text-lg font-semibold text-foreground mb-3">{t('description')}</h2>
          <p className="text-foreground whitespace-pre-wrap leading-relaxed">{org.description}</p>
        </div>
      )}

      {org.mission_statement && (
        <div className="mt-8 pt-8 border-t border-border">
          <h2 className="text-lg font-semibold text-foreground mb-3">{t('missionStatement')}</h2>
          <p className="text-foreground whitespace-pre-wrap leading-relaxed">
            {org.mission_statement}
          </p>
        </div>
      )}
    </div>
  );
}
