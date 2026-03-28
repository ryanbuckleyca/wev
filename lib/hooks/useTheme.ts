'use client'

import { useState } from 'react'

export function useTheme() {
  const [theme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    const current = document.documentElement.getAttribute('data-theme') as 'light' | 'dark'
    return current === 'dark' || current === 'light' ? current : 'light'
  })
  const [mounted] = useState(() => typeof window !== 'undefined')

  return { theme, mounted }
}
