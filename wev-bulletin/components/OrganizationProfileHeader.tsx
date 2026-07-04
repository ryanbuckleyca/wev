import { Leaf1Solid } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import type { OrgRecord } from '@/lib/organizations/types';

interface Props {
  org: OrgRecord;
  t: (key: string) => string;
}

export default function OrganizationProfileHeader({ org, t }: Props) {

  return (
    <div className="bg-card border border-border rounded-wev-card p-6 sm:p-8 mb-8 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-foreground">{org.name}</h1>
            {org.is_sse && (
              <span className="flex-shrink-0" role="img" aria-label={t('sseBadgeLabel')}>
                <Lineicons icon={Leaf1Solid} size={24} className="text-wev-success" />
              </span>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-2 text-muted-foreground mt-4">
            {org.location && (
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">{t('location')}:</span> {org.location}
              </div>
            )}
            
            {org.website && (
              <a
                href={org.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                {t('visitWebsite')}
              </a>
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
    </div>
  );
}
