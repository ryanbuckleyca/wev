'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { JobPosting } from '@/lib/supabase'
import Button from './Button'

interface CopyAllJobsButtonProps {
  jobs: JobPosting[]
}

function formatDate(dateString: string): string {
  // Parse date string - if it doesn't have timezone, treat as UTC
  let date: Date
  if (typeof dateString === 'string' && !dateString.endsWith('Z') && !dateString.match(/[+-]\d{2}:\d{2}$/)) {
    date = new Date(dateString + 'Z')
  } else {
    date = new Date(dateString)
  }
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
}

function formatJobsAsText(jobs: JobPosting[], t: ReturnType<typeof useTranslations>): string {
  return jobs
    .map((job) => {
      const lines = [
        `${t('jobCard.who')} ${job.organization}`,
        `${t('jobCard.what')} ${job.job_title}`,
        `${t('jobCard.where')} ${job.location || t('jobCard.nA')}`,
        ...(job.summary ? [`${t('jobCard.why')} ${job.summary}`] : []),
        `${t('jobCard.when')} ${t('jobCard.posted')} ${formatDate(job.date_posted)}`,
        `${t('jobCard.howMuch')} ${job.wage || t('jobCard.nA')}`,
      ]
      return lines.join('\n')
    })
    .join('\n\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatJobsAsHTML(jobs: JobPosting[], t: ReturnType<typeof useTranslations>): string {
  return jobs
    .map((job) => {
      const what = job.listing_url
        ? `<a href="${escapeHtml(job.listing_url)}">${escapeHtml(job.job_title)}</a>`
        : escapeHtml(job.job_title)
      const lines = [
        `<b>${t('jobCard.who')}</b> ${escapeHtml(job.organization)}`,
        `<b>${t('jobCard.what')}</b> ${what}`,
        `<b>${t('jobCard.where')}</b> ${escapeHtml(job.location || t('jobCard.nA'))}`,
        ...(job.summary ? [`<b>${t('jobCard.why')}</b> ${escapeHtml(job.summary)}`] : []),
        `<b>${t('jobCard.when')}</b> ${t('jobCard.posted')} ${escapeHtml(formatDate(job.date_posted))}`,
        `<b>${t('jobCard.howMuch')}</b> ${escapeHtml(job.wage || t('jobCard.nA'))}`,
      ]
      return lines.join('<br>')
    })
    .join('<br><br>')
}

export default function CopyAllJobsButton({ jobs }: CopyAllJobsButtonProps) {
  const t = useTranslations()
  const [copied, setCopied] = useState(false)
  const copiedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Clear any existing timeout when component unmounts
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = async () => {
    if (jobs.length === 0) return

    // Clear any existing timeout
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current)
    }

    try {
      const text = formatJobsAsText(jobs, t)
      const html = formatJobsAsHTML(jobs, t)
      
      // Use Clipboard API with both HTML and plain text formats
      // This matches what the browser copies when you manually select and copy
      const clipboardItem = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })
      
      await navigator.clipboard.write([clipboardItem])
      setCopied(true)
      
      // Set timeout to reset copied state
      copiedTimeoutRef.current = setTimeout(() => {
        setCopied(false)
        copiedTimeoutRef.current = null
      }, 2000)
    } catch (err) {
      console.error('Failed to copy with ClipboardItem, trying plain text:', err)
      // Fallback to plain text if ClipboardItem fails
      try {
        const text = formatJobsAsText(jobs, t)
        await navigator.clipboard.writeText(text)
        setCopied(true)
        
        copiedTimeoutRef.current = setTimeout(() => {
          setCopied(false)
          copiedTimeoutRef.current = null
        }, 2000)
      } catch (textErr) {
        console.error('Failed to copy:', textErr)
        // Final fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = formatJobsAsText(jobs, t)
        document.body.appendChild(textArea)
        textArea.select()
        try {
          document.execCommand('copy')
          setCopied(true)
          
          copiedTimeoutRef.current = setTimeout(() => {
            setCopied(false)
            copiedTimeoutRef.current = null
          }, 2000)
        } catch (fallbackErr) {
          console.error('Fallback copy failed:', fallbackErr)
        }
        document.body.removeChild(textArea)
      }
    }
  }

  return (
    <div title={jobs.length > 0 ? t('buttons.copyJobsTitle', { count: jobs.length }) : undefined}>
      <Button
        onClick={handleCopy}
        disabled={copied || jobs.length === 0}
        variant="secondary"
        size="md"
        fullWidth={false}
      >
        {copied ? t('buttons.copied') : t('buttons.copyAllJobs')}
      </Button>
    </div>
  )
}
