'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const current = document.documentElement.getAttribute('data-theme') as 'light' | 'dark'
    if (current === 'dark' || current === 'light') {
      setTheme(current)
    }
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  if (!mounted) return null

  return (
    <button
      type="button"
      onClick={toggle}
      className={`relative inline-flex h-10 w-16 items-center rounded-wev-pill border border-[var(--primary)] transition-colors ${
        theme === 'dark' ? 'bg-wev-bg' : 'bg-wev-surface-tint'
      }`}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span
        className={`inline-flex h-8 w-8 transform items-center justify-center rounded-full transition-transform ${
          theme === 'dark' ? 'translate-x-7' : 'translate-x-1'
        } ${
          theme === 'dark' ? 'bg-wev-surface' : 'bg-wev-surface'
        }`}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
    </button>
  )
}
