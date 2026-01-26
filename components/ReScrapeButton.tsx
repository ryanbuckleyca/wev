'use client'

import { useState } from 'react'

interface ReScrapeButtonProps {
  onComplete: () => void
}

export default function ReScrapeButton({ onComplete }: ReScrapeButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const triggerWorkflow = async () => {
    setLoading(true)
    setError(null)

    try {
      // Trigger the workflow
      const triggerResponse = await fetch('/api/github/workflow', {
        method: 'POST',
      })

      if (!triggerResponse.ok) {
        const errorData = await triggerResponse.json()
        throw new Error(errorData.error || 'Failed to trigger workflow')
      }

      // Poll for completion
      const checkStatus = async (): Promise<boolean> => {
        const statusResponse = await fetch('/api/github/status')
        if (!statusResponse.ok) {
          throw new Error('Failed to check workflow status')
        }

        const status = await statusResponse.json()

        if (status.error) {
          throw new Error(status.error)
        }

        if (status.completed) {
          return status.success
        }

        // Still running, check again in 3 seconds
        await new Promise((resolve) => setTimeout(resolve, 3000))
        return checkStatus()
      }

      const success = await checkStatus()

      if (success) {
        // Refetch data
        onComplete()
      } else {
        setError('Workflow completed but may have failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-6">
      <button
        onClick={triggerWorkflow}
        disabled={loading}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
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
      {error && (
        <p className="mt-2 text-red-600 text-sm">{error}</p>
      )}
    </div>
  )
}
