'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/')
    }, 3000)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4">
      <div className="w-full max-w-md">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--success-tint)] rounded-full">
              <svg
                className="w-8 h-8 text-[var(--success-solid)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h1 className="design-type-h2 mb-3 text-[var(--text-primary)]">Password Reset Successfully!</h1>
          <p className="design-type-body text-[var(--text-secondary)] mb-6">
            Your password has been updated. You can now log in with your new password.
          </p>
          <p className="design-type-body-small text-[var(--text-tertiary)]">
            Redirecting to login in 3 seconds...
          </p>
        </div>
      </div>
    </div>
  )
}
