'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

interface ReScrapeButtonProps {
  onComplete: () => void
}

export default function ReScrapeButton({ onComplete }: ReScrapeButtonProps) {
  const [loading, setLoading] = useState(false)

  const triggerWorkflow = async () => {
    setLoading(true)

    try {
      // Trigger the workflow
      const triggerResponse = await fetch('/api/github/workflow', {
        method: 'POST',
      })

      if (!triggerResponse.ok) {
        const errorData = await triggerResponse.json()
        throw new Error(errorData.error || 'Failed to trigger workflow')
      }

      // Instead of polling, we'll check once and then rely on the user to refresh
      // or implement proper webhook/event-driven updates later
      toast.success('Workflow started successfully. The page will refresh automatically when complete.')

      // Set up a one-time check after a reasonable delay, but don't poll indefinitely
      setTimeout(async () => {
        try {
          const statusResponse = await fetch('/api/github/status')
          if (statusResponse.ok) {
            const status = await statusResponse.json()
            if (status.completed && status.success) {
              onComplete()
              toast.success('Re-scrape complete. Data refreshed.')
            } else if (status.completed && !status.success) {
              toast.error('Workflow completed but may have failed')
            }
            // If still running, user will need to check manually or we implement proper events
          }
        } catch (err) {
          console.error('Status check failed:', err)
        } finally {
          setLoading(false)
        }
      }, 10000) // Check once after 10 seconds

    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={triggerWorkflow}
      disabled={loading}
      className="px-6 py-2.5 bg-wev-primary text-white border-2 border-wev-primary rounded-wev-btn font-semibold shadow-wev-btn hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:translate-y-0 disabled:shadow-wev-btn disabled:cursor-not-allowed transition-all duration-300"
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
          Running workflow...
        </span>
      ) : (
        'Re-scrape Data'
      )}
    </button>
  )
}
