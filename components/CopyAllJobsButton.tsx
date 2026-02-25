'use client'

import { useState, useEffect, useRef } from 'react'
import { JobPosting } from '@/lib/supabase'

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
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
}

function formatJobsAsText(jobs: JobPosting[]): string {
  return jobs
    .map((job) => {
      const lines = [
        `Who: ${job.organization}`,
        `What: ${job.job_title}`,
        `Where: ${job.location || 'N/A'}`,
        ...(job.summary ? [`Why: ${job.summary}`] : []),
        `When: Posted ${formatDate(job.date_posted)}`,
        `How much: ${job.wage || 'N/A'}`,
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

function formatJobsAsHTML(jobs: JobPosting[]): string {
  return jobs
    .map((job) => {
      const what = job.listing_url
        ? `<a href="${escapeHtml(job.listing_url)}">${escapeHtml(job.job_title)}</a>`
        : escapeHtml(job.job_title)
      const lines = [
        `<b>Who:</b> ${escapeHtml(job.organization)}`,
        `<b>What:</b> ${what}`,
        `<b>Where:</b> ${escapeHtml(job.location || 'N/A')}`,
        ...(job.summary ? [`<b>Why:</b> ${escapeHtml(job.summary)}`] : []),
        `<b>When:</b> Posted ${escapeHtml(formatDate(job.date_posted))}`,
        `<b>How much:</b> ${escapeHtml(job.wage || 'N/A')}`,
      ]
      return lines.join('<br>')
    })
    .join('<br><br>')
}

export default function CopyAllJobsButton({ jobs }: CopyAllJobsButtonProps) {
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
      const text = formatJobsAsText(jobs)
      const html = formatJobsAsHTML(jobs)
      
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
        const text = formatJobsAsText(jobs)
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
        textArea.value = formatJobsAsText(jobs)
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

  if (jobs.length === 0) {
    return null
  }

  return (
    <button
      onClick={handleCopy}
      disabled={copied}
      className="w-full sm:w-auto px-6 py-2.5 bg-transparent text-wev-accent border-2 border-wev-accent rounded-wev-btn font-semibold hover:bg-wev-accent-tint hover:border-wev-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
      title={`Copy ${jobs.length} job${jobs.length !== 1 ? 's' : ''} to clipboard`}
    >
      {copied ? 'Copied!' : 'Copy All Jobs'}
    </button>
  )
}
