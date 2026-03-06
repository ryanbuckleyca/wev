import { useEffect, useState } from 'react'

type Breakpoints = {
  isUnder400: boolean
  isUnder365: boolean
}

export function useResponsiveMenuBreakpoints(): Breakpoints {
  const [isUnder400, setIsUnder400] = useState(true)
  const [isUnder365, setIsUnder365] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const themeQuery = window.matchMedia('(max-width: 400px)')
    const localeQuery = window.matchMedia('(max-width: 365px)')

    const handleTheme = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsUnder400('matches' in event ? event.matches : themeQuery.matches)
    }
    const handleLocale = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsUnder365('matches' in event ? event.matches : localeQuery.matches)
    }

    const subscribe = (
      query: MediaQueryList,
      handler: (event: MediaQueryListEvent) => void
    ) => {
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', handler)
        return () => query.removeEventListener('change', handler)
      }

      query.addListener(handler)
      return () => query.removeListener(handler)
    }

    const unsubscribeTheme = subscribe(themeQuery, handleTheme)
    const unsubscribeLocale = subscribe(localeQuery, handleLocale)

    handleTheme(themeQuery)
    handleLocale(localeQuery)

    return () => {
      unsubscribeTheme()
      unsubscribeLocale()
    }
  }, [])

  return { isUnder400, isUnder365 }
}
