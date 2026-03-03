'use client'

import { useState, useRef, useEffect } from 'react'
import notify from '@/lib/toast'
import Button from './Button'

interface ReScrapeButtonProps {
  onComplete: () => void
}

const POLL_INTERVAL_MS = 15_000
const MAX_WAIT_MS = 10 * 60_000

export default function ReScrapeButton({ onComplete }: ReScrapeButtonProps) {
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState('Re-scrape Data')
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  const stopPolling = () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }

  const triggerWorkflow = async () => {
    setLoading(true)
    setStatusText('Starting...')

    // Capture before the request and subtract 30s buffer for clock skew / fast dispatch
    const triggeredAt = new Date(Date.now() - 30_000).toISOString()

    try {
      const triggerResponse = await fetch('/api/github/workflow', { method: 'POST' })
      if (!triggerResponse.ok) {
        const errorData = await triggerResponse.json()
        throw new Error(errorData.error || 'Failed to trigger workflow')
      }

      notify.success('Workflow triggered. Waiting for it to complete...')
      setStatusText('Queued...')

      // Give GitHub a moment before the new run appears in the API
      await new Promise(r => setTimeout(r, 5000))

      const startedAt = Date.now()

      const poll = async () => {
        if (Date.now() - startedAt > MAX_WAIT_MS) {
          notify.error('Timed out waiting for workflow. Check GitHub Actions.')
          stopPolling()
          setLoading(false)
          setStatusText('Re-scrape Data')
          return
        }

        abortControllerRef.current = new AbortController()

        try {
          const res = await fetch(
            `/api/github/status?created_after=${encodeURIComponent(triggeredAt)}`,
            { signal: abortControllerRef.current.signal }
          )
          const status = await res.json()

          if (!res.ok || status.error) {
            notify.error(`Failed to check workflow status: ${status.error ?? res.statusText}`)
            stopPolling()
            setLoading(false)
            setStatusText('Re-scrape Data')
            return
          }

          if (status.running) {
            setStatusText('Running...')
            pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
          } else if (status.completed && status.success) {
            notify.success('Re-scrape complete. Refreshing data...')
            stopPolling()
            onComplete()
            setLoading(false)
            setStatusText('Re-scrape Data')
          } else if (status.completed && !status.success) {
            notify.error(`Workflow finished with status: ${status.conclusion}`)
            stopPolling()
            setLoading(false)
            setStatusText('Re-scrape Data')
          } else {
            // Run not found yet (still queued or not visible) — keep waiting
            setStatusText('Queued...')
            pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return
          // Network hiccup — retry
          pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
        }
      }

      poll()

    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'An error occurred')
      stopPolling()
      setLoading(false)
      setStatusText('Re-scrape Data')
    }
  }

  return (
    <div>
    <Button
      onClick={triggerWorkflow}
      disabled={loading}
      variant="primary"
      size="md"
      loading={loading}
      fullWidth={false}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg
            className="animate-spin h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          {statusText}
        </span>
      ) : (
        statusText
      )}
    </Button>
    </div>
  )
}
