import OrganizationCard from './OrganizationCard';
import type { OrgIndexEntry } from '@/lib/organizations/types';

interface Props {
  orgs: OrgIndexEntry[];
  locale: string;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  tCommon: (key: string) => string;
  isLoggedIn: boolean;
}

export default function OrganizationIndexView({ orgs, locale, t, tCommon, isLoggedIn }: Props) {
  if (orgs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="bg-muted p-8 rounded-wev-card max-w-md">
          <p className="text-muted-foreground">{t('noActiveListings')}</p>
        </div>
      </div>
    );
  }

  const sseBadgeLabel = t('sseBadgeLabel');

  return (
    <div className="flex flex-col gap-4">
      {orgs.map((org) => (
        <OrganizationCard
          key={org.id}
          org={org}
          locale={locale}
          sseBadgeLabel={sseBadgeLabel}
          jobCountLabel={t('jobs', { count: org.active_job_count })}
          noDescriptionLabel={t('noDescription')}
          websiteLabel={t('website')}
          viewProfileLabel={t('viewProfile')}
          showMoreLabel={tCommon('showMore')}
          showLessLabel={tCommon('showLess')}
          isLoggedIn={isLoggedIn}
          translateTooltip={(key, values) => t(key, values as Record<string, string | number>)}
        />
      ))}
    </div>
  );
}
