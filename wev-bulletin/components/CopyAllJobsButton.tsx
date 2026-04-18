'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { JobPosting } from '@/lib/supabase';
import Button from './Button';

interface CopyAllJobsButtonProps {
  jobs: JobPosting[];
  fetchJobs?: () => Promise<JobPosting[]>;
  buttonClassName?: string;
}

function formatDate(dateString: string, locale?: string): string {
  // Parse date string - if it doesn't have timezone, treat as UTC
  let date: Date;
  if (
    typeof dateString === 'string' &&
    !dateString.endsWith('Z') &&
    !dateString.match(/[+-]\d{2}:\d{2}$/)
  ) {
    date = new Date(dateString + 'Z');
  } else {
    date = new Date(dateString);
  }
  return date.toLocaleDateString(locale || 'en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

function formatJobsAsText(
  jobs: JobPosting[],
  t: ReturnType<typeof useTranslations>,
  locale?: string,
): string {
  return jobs
    .map((job) => {
      const lines = [
        `${t('jobCard.who')} ${job.organization}`,
        `${t('jobCard.what')} ${job.job_title}`,
        `${t('jobCard.where')} ${job.location || t('jobCard.nA')}`,
        ...(job.summary ? [`${t('jobCard.why')} ${job.summary}`] : []),
        `${t('jobCard.when')} ${t('jobCard.posted')} ${formatDate(job.date_posted, locale)}`,
        `${t('jobCard.howMuch')} ${job.wage || t('jobCard.nA')}`,
      ];
      return lines.join('\n');
    })
    .join('\n\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatJobsAsHTML(
  jobs: JobPosting[],
  t: ReturnType<typeof useTranslations>,
  locale?: string,
): string {
  return jobs
    .map((job) => {
      const what = job.listing_url
        ? `<a href="${escapeHtml(job.listing_url)}">${escapeHtml(job.job_title)}</a>`
        : escapeHtml(job.job_title);
      const lines = [
        `<b>${t('jobCard.who')}</b> ${escapeHtml(job.organization)}`,
        `<b>${t('jobCard.what')}</b> ${what}`,
        `<b>${t('jobCard.where')}</b> ${escapeHtml(job.location || t('jobCard.nA'))}`,
        ...(job.summary ? [`<b>${t('jobCard.why')}</b> ${escapeHtml(job.summary)}`] : []),
        `<b>${t('jobCard.when')}</b> ${t('jobCard.posted')} ${escapeHtml(formatDate(job.date_posted, locale))}`,
        `<b>${t('jobCard.howMuch')}</b> ${escapeHtml(job.wage || t('jobCard.nA'))}`,
      ];
      return lines.join('<br>');
    })
    .join('<br><br>');
}

export default function CopyAllJobsButton({
  jobs,
  fetchJobs,
  buttonClassName,
}: CopyAllJobsButtonProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const copiedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear any existing timeout when component unmounts
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (jobs.length === 0 || isFetching) return;

    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }

    setIsFetching(true);

    try {
      const jobsPromise = fetchJobs ? fetchJobs() : Promise.resolve(jobs);

      // Web API standard dictates passing Promises to ClipboardItem preserves the synchronous user activation context
      const htmlBlobPromise = jobsPromise.then(
        (jobsToCopy) => new Blob([formatJobsAsHTML(jobsToCopy, t, locale)], { type: 'text/html' }),
      );
      const textBlobPromise = jobsPromise.then(
        (jobsToCopy) => new Blob([formatJobsAsText(jobsToCopy, t, locale)], { type: 'text/plain' }),
      );

      const clipboardItem = new ClipboardItem({
        'text/html': htmlBlobPromise,
        'text/plain': textBlobPromise,
      });

      await navigator.clipboard.write([clipboardItem]);
      setCopied(true);

      copiedTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copiedTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy with ClipboardItem, trying plain text:', err);
      // Fallback for browsers that don't support ClipboardItem (e.g., Firefox) or if it fails
      try {
        const jobsToCopy = fetchJobs ? await fetchJobs() : jobs;
        const text = formatJobsAsText(jobsToCopy, t);
        await navigator.clipboard.writeText(text);
        setCopied(true);

        copiedTimeoutRef.current = setTimeout(() => {
          setCopied(false);
          copiedTimeoutRef.current = null;
        }, 2000);
      } catch (textErr) {
        console.error('Failed plain text copy:', textErr);
        // Final fallback for older browsers using execCommand
        const textArea = document.createElement('textarea');
        const jobsToCopy = fetchJobs ? await fetchJobs() : jobs;
        textArea.value = formatJobsAsText(jobsToCopy, t);
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          setCopied(true);

          copiedTimeoutRef.current = setTimeout(() => {
            setCopied(false);
            copiedTimeoutRef.current = null;
          }, 2000);
        } catch (fallbackErr) {
          console.error('Fallback execCommand failed:', fallbackErr);
        }
        document.body.removeChild(textArea);
      }
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <div title={jobs.length > 0 ? t('buttons.copyJobsTitle', { count: jobs.length }) : undefined}>
      <Button
        onClick={handleCopy}
        disabled={copied || jobs.length === 0 || isFetching}
        variant="secondary"
        size="md"
        fullWidth={false}
        className={buttonClassName}
      >
        {isFetching ? t('buttons.copying') : copied ? t('buttons.copied') : t('buttons.copyAllJobs')}
      </Button>
    </div>
  );
}
