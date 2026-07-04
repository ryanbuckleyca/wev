import type { OrgJobPosting } from '@/lib/organizations/types';
import { useTranslations, useLocale } from 'next-intl';

export default function OrganizationJobRow({ job }: { job: OrgJobPosting }) {
  const t = useTranslations('bulletin');
  const locale = useLocale();

  // Format the date
  let formattedDate = '';
  if (job.date_posted) {
    const date = new Date(job.date_posted);
    if (!isNaN(date.getTime())) {
      formattedDate = new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
    } else {
      formattedDate = job.date_posted;
    }
  }

  return (
    <a
      href={job.listing_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group border border-border rounded-wev-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-lg text-primary-text group-hover:underline">
          {job.job_title}
        </h3>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {job.location && (
            <div className="flex items-center gap-1.5">
              <span>{job.location}</span>
            </div>
          )}

          {job.work_type && (
            <div className="flex items-center gap-1.5">
              <span>{t(`workTypes.${job.work_type}`, { fallback: job.work_type })}</span>
            </div>
          )}

          {job.employment_type && (
            <div className="flex items-center gap-1.5">
              <span>
                {t(`employmentTypes.${job.employment_type}`, { fallback: job.employment_type })}
              </span>
            </div>
          )}

          {formattedDate && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span>{formattedDate}</span>
            </div>
          )}
        </div>
      </div>
    </a>
  );
}
