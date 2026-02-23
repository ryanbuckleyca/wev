'use client'

import { useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { useTheme } from '@/lib/hooks/useTheme'

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void
  onError: () => void
  onExpire: () => void
}

export default function TurnstileWidget({ onSuccess, onError, onExpire }: TurnstileWidgetProps) {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Ensure component is mounted before rendering Turnstile
  useState(() => {
    setMounted(true)
  })

  if (!mounted) {
    return (
      <div className="flex justify-center">
        <div className="w-[300px] h-[65px] rounded-lg border border-[var(--border)] bg-[var(--bg)] animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex justify-center">
      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
        options={{ theme }}
        onSuccess={onSuccess}
        onError={onError}
        onExpire={onExpire}
      />
    </div>
  )
}
