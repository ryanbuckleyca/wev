import Link from 'next/link';
import type { OrgIndexEntry } from '@/lib/organizations/types';
import SseBadge from './SseBadge';

interface Props {
  org: OrgIndexEntry;
  locale: string;
  sseBadgeLabel: string;
  jobCountLabel: string;
}

export default function OrganizationCard({ org, locale, sseBadgeLabel, jobCountLabel }: Props) {
  return (
    <div className="bg-card rounded-wev-card p-5 border border-border shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-1.5 overflow-hidden w-full">
        <div className="flex items-center gap-2 max-w-full">
          <Link
            href={`/${locale}/organizations/${org.slug}`}
            className="text-primary-text font-semibold text-lg hover:underline truncate"
          >
            {org.name}
          </Link>
          {org.is_sse && <SseBadge label={sseBadgeLabel} />}
        </div>

        {org.location && (
          <div className="text-muted-foreground text-sm truncate">{org.location}</div>
        )}
      </div>

      <div className="flex-shrink-0 bg-primary-tint text-primary-text px-3 py-1 rounded-wev-pill text-sm font-medium whitespace-nowrap self-start sm:self-center">
        {jobCountLabel}
      </div>
    </div>
  );
}
