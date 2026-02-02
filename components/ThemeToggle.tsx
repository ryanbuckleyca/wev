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
      className="fixed top-8 right-8 z-50 px-6 py-3 rounded-wev-pill border-2 border-wev-border bg-wev-surface text-wev-text-primary font-semibold text-sm shadow-wev-btn hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
    </button>
  )
}
