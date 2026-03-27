'use client'

import { useSyncExternalStore } from 'react'

/**
 * Subscribes to `window.matchMedia(query)`. Server snapshot is `false` to match SSR;
 * safe for components that only render meaningful UI after client interaction (e.g. modals).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined') return () => {}
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => (typeof window === 'undefined' ? false : window.matchMedia(query).matches),
    () => false
  )
}
