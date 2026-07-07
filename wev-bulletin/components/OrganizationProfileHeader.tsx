import { safeUrl } from '@/lib/url';
import type { OrgRecord } from '@/lib/organizations/types';
import SseBadge from './SseBadge';

interface Props {
  org: OrgRecord;
  t: (key: string) => string;
}

export default function OrganizationProfileHeader({ org, t }: Props) {
  const websiteUrl = safeUrl(org.website);

  return (
    <div className="bg-card border border-border rounded-wev-card p-6 sm:p-8 mb-8 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-foreground">{org.name}</h1>
            {org.is_sse && <SseBadge label={t('sseBadgeLabel')} size={24} />}
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
