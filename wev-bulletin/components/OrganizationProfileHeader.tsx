import { Leaf1Solid, Leaf1Outlined } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { safeUrl } from '@/lib/url';
import type { OrgRecord } from '@/lib/organizations/types';

interface Props {
  org: OrgRecord;
  t: (key: string) => string;
}

export default function OrganizationProfileHeader({ org, t }: Props) {
  const websiteUrl = safeUrl(org.website);
  const sseDetails =
    org.sse_details && typeof org.sse_details === 'object' && !Array.isArray(org.sse_details)
      ? (org.sse_details as Record<string, unknown>)
      : null;
  const sseReasoning =
    sseDetails && typeof sseDetails.reasoning === 'string' ? sseDetails.reasoning : null;

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
                <span className="font-medium text-foreground">{t('orgType')}:</span> {org.type}
              </div>
            )}
          </div>
        </div>
      </div>

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

      {org.values_list && org.values_list.length > 0 && (
        <div className="mt-8 pt-8 border-t border-border">
          <h2 className="text-lg font-semibold text-foreground mb-3">{t('values')}</h2>
          <div className="flex flex-wrap gap-2">
            {org.values_list.map((value, index) => (
              <span
                key={`${value}-${index}`}
                className="bg-primary-tint text-primary-text px-3 py-1 rounded-wev-pill text-sm font-medium"
              >
                {value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
