'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import RoundToggle from './RoundToggle'

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem('theme')
  if (stored === 'dark' || stored === 'light') return stored
  return 'light'
}

export default function ThemeToggle() {
  const t = useTranslations('ariaLabels.themeToggle')
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)
  const [mounted, setMounted] = useState(false)

  // Sync React state with localStorage on mount (the inline script in the
  // layout already applied data-theme to the DOM before hydration).
  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('theme')
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored)
    }
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    
    // Add transition class to body for smooth theme change
    document.body.classList.add('theme-transition')
    
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
    // Persist to cookie so the server layout can include data-theme on <html>
    // during soft navigations (e.g. locale switches).
    document.cookie = `theme=${next};path=/;max-age=31536000;SameSite=Lax`
    
    // Remove transition class after CSS animation completes
    // CSS handles the timing and cleanup automatically
  }

  if (!mounted) return null

  return (
    <RoundToggle>
      <button
        type="button"
        onClick={toggle}
        className={`relative flex py-1 w-14 items-center justify-start rounded-full transition-all duration-500 ease-in-out h-full ${
          theme === 'dark' ? 'bg-wev-bg' : 'bg-wev-bg'
        }`}
        aria-label={theme === 'dark' ? t('switchToLight') : t('switchToDark')}
      >
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-all duration-500 ease-in-out ${
            theme === 'dark' ? 'ml-auto mr-0.5' : 'ml-0.5'
          } bg-wev-surface`}
        >
          <span className="text-xl leading-none">{theme === 'dark' ? '☀️' : '🌙'}</span>
        </span>
      </button>
    </RoundToggle>
  )
}
