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
  const [mounted] = useState(() => typeof window !== 'undefined')

  if (!mounted) {
    return (
      <div className="w-full">
        <div className="w-full h-[65px] rounded-lg border border-[var(--border)] bg-[var(--background)] animate-pulse" />
      </div>
    )
  }

  return (
    <div className="w-full">
      <Turnstile
        className="w-full"
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
        options={{ theme, size: 'flexible' }}
        onSuccess={onSuccess}
        onError={onError}
        onExpire={onExpire}
      />
    </div>
  )
}
