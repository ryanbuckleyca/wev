'use client';

import NextLink from 'next/link';
import { type JobPosting } from '@/lib/supabase';
import { formatCompensation } from '@/lib/compensation/helpers';

interface JobCardDetailsProps {
  job: JobPosting;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  formatDate: (date: string) => string;
}

export default function JobCardDetails({ job, locale, t, formatDate }: JobCardDetailsProps) {
  return (
    <div className="job-details py-4 px-5 bg-card">
      <div className="job-detail-line">
        <span className="job-label">{t('jobCard.who')} </span>
        {job.organization_slug ? (
          <NextLink href={`/${locale}/organizations/${job.organization_slug}`} className="job-link">
            {job.organization}
          </NextLink>
        ) : (
          <span className="job-value">{job.organization}</span>
        )}
        <br />
      </div>
      <div className="job-detail-line">
        <span className="job-label">{t('jobCard.what')} </span>
        {job.listing_url ? (
          <a href={job.listing_url} target="_blank" rel="noopener noreferrer" className="job-link">
            {job.job_title}
          </a>
        ) : (
          <span className="job-value">{job.job_title}</span>
        )}
        <br />
      </div>
      <div className="job-detail-line">
        <span className="job-label">{t('jobCard.where')} </span>
        <span className="job-value">{job.location || t('jobCard.nA')}</span>
        <br />
      </div>
      {job.summary && (
        <div className="job-detail-line">
          <span className="job-label">{t('jobCard.why')} </span>
          <span className="job-value">{job.summary}</span>
          <br />
        </div>
      )}
      <div className="job-detail-line">
        <span className="job-label">{t('jobCard.when')} </span>
        <span className="job-value">
          {t('jobCard.posted')} {formatDate(job.date_posted)}
        </span>
        <br />
      </div>
      <div className="job-detail-line">
        {(() => {
          const compensationDisplay = formatCompensation(job, locale, {
            perYear: t('jobCard.perYear'),
            perHour: t('jobCard.perHour'),
            statedHoursPerWeek: (hours) => t('jobCard.statedHoursPerWeek', { hours }),
            volunteer: t('jobCard.volunteer'),
            internship: t('jobCard.internship'),
          });
          return (
            <>
              <span className="job-label">{t('jobCard.howMuch')} </span>
              <span className="job-value">{compensationDisplay.primary}</span>
              {compensationDisplay.secondary && (
                <span className="job-value text-muted-foreground text-sm">
                  {' '}
                  ({compensationDisplay.secondary})
                </span>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
