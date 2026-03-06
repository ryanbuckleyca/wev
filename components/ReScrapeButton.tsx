'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import notify from '@/lib/toast'
import Button from './Button'

interface ReScrapeButtonProps {
  onComplete: () => void
}

const POLL_INTERVAL_MS = 15_000
const MAX_WAIT_MS = 10 * 60_000
const STORAGE_KEY = 'wev-scrape-state'

interface ScrapeState {
  triggeredAt: string
  startedAt: number
  status: 'queued' | 'running'
}

function loadScrapeState(): ScrapeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: ScrapeState = JSON.parse(raw)
    if (Date.now() - parsed.startedAt > MAX_WAIT_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function saveScrapeState(state: ScrapeState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function clearScrapeState() {
  localStorage.removeItem(STORAGE_KEY)
}

export default function ReScrapeButton({ onComplete }: ReScrapeButtonProps) {
  const t = useTranslations()
  const tReScrape = useTranslations('reScrape')
  const locale = useLocale()
  const [loading, setLoading] = useState(() => !!loadScrapeState())
  const [statusState, setStatusState] = useState<'idle' | 'starting' | 'queued' | 'running'>(() => {
    const saved = loadScrapeState()
    if (!saved) return 'idle'
    return saved.status
  })
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Compute status text reactively based on current locale and state
  const statusText = useMemo(() => {
    if (statusState === 'idle') return t('buttons.reScrape')
    if (statusState === 'starting') return t('buttons.reScrapeStarting')
    if (statusState === 'running') return t('buttons.reScrapeRunning')
    return t('buttons.reScrapeQueued')
  }, [statusState, t, locale])

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  const reset = useCallback(() => {
    stopPolling()
    clearScrapeState()
    setLoading(false)
    setStatusState('idle')
  }, [stopPolling])

  const startPolling = useCallback((triggeredAt: string, startedAt: number) => {
    const poll = async () => {
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        notify.error(tReScrape('timeout'))
        reset()
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
          notify.error(tReScrape('checkFailed', { error: status.error ?? res.statusText }))
          reset()
          return
        }

        if (status.running) {
          setStatusState('running')
          saveScrapeState({ triggeredAt, startedAt, status: 'running' })
          pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
        } else if (status.completed && status.success) {
          notify.success(tReScrape('complete'))
          reset()
          onComplete()
        } else if (status.completed && !status.success) {
          notify.error(tReScrape('workflowFailed', { status: status.conclusion }))
          reset()
        } else {
          setStatusState('queued')
          saveScrapeState({ triggeredAt, startedAt, status: 'queued' })
          pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    poll()
      }, [onComplete, reset, t, tReScrape])

  // Resume polling on mount if there's a persisted in-flight scrape
  useEffect(() => {
    const saved = loadScrapeState()
    if (saved) {
      startPolling(saved.triggeredAt, saved.startedAt)
    }
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
      abortControllerRef.current?.abort()
    }
  }, [startPolling])

  const triggerWorkflow = async () => {
    setLoading(true)
    setStatusState('starting')

    const triggeredAt = new Date(Date.now() - 30_000).toISOString()

    try {
      const triggerResponse = await fetch('/api/github/workflow', { method: 'POST' })
      if (!triggerResponse.ok) {
        const errorData = await triggerResponse.json()
        throw new Error(errorData.error || tReScrape('failedToTrigger'))
      }

      notify.success(tReScrape('triggered'))
      setStatusState('queued')

      const startedAt = Date.now()
      saveScrapeState({ triggeredAt, startedAt, status: 'queued' })

      await new Promise(r => setTimeout(r, 5000))

      startPolling(triggeredAt, startedAt)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : tReScrape('error'))
      reset()
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
