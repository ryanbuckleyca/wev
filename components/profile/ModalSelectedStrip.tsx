'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import HorizontalScrollWithFades from '@/components/ui/HorizontalScrollWithFades'

export type ModalStripApi = {
  rovingIndex: number | null
  setRemoveRef: (id: string) => (el: HTMLButtonElement | null) => void
  composite: true
}

export interface ModalSelectedStripProps {
  itemIds: string[]
  resultsListRef: RefObject<HTMLElement | null>
  regionHintId?: string
  ariaLabel: string
  useHorizontalScroll?: boolean
  fadeBackground?: string
  children: (api: ModalStripApi) => React.ReactNode
}

/**
 * One tab stop for the selected-items strip in profile browse modals; Tab moves to
 * `resultsListRef`. Enter starts roving focus on remove buttons; arrows move
 * between removes; Tab / Escape return to the list or region (matches skills modal).
 */
export default function ModalSelectedStrip({
  itemIds,
  resultsListRef,
  regionHintId,
  ariaLabel,
  useHorizontalScroll = false,
  fadeBackground = 'var(--card)',
  children,
}: ModalSelectedStripProps) {
  const regionRef = useRef<HTMLDivElement>(null)
  const removeRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const setRemoveRef = useCallback((id: string) => (el: HTMLButtonElement | null) => {
    if (el) removeRefs.current.set(id, el)
    else removeRefs.current.delete(id)
  }, [])

  const [rovingIndex, setRovingIndex] = useState<number | null>(null)
  const idsKey = itemIds.join('|')

  const api: ModalStripApi = {
    rovingIndex,
    setRemoveRef,
    composite: true,
  }

  useEffect(() => {
    if (rovingIndex === null) return
    const len = itemIds.length
    if (len === 0) {
      setRovingIndex(null)
      return
    }
    const clamped = Math.min(rovingIndex, len - 1)
    if (clamped !== rovingIndex) {
      setRovingIndex(clamped)
      return
    }
    const id = itemIds[clamped]
    if (id) {
      requestAnimationFrame(() => removeRefs.current.get(id)?.focus())
    }
  }, [rovingIndex, idsKey])

  const exitToList = useCallback(() => {
    setRovingIndex(null)
    resultsListRef?.current?.focus()
  }, [resultsListRef])

  const handleRegionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (rovingIndex === null) {
        if (e.key === 'Enter') {
          e.preventDefault()
          setRovingIndex(0)
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          resultsListRef?.current?.focus()
        }
      }
    },
    [rovingIndex, resultsListRef],
  )

  const handleStripCapture = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (rovingIndex === null) return
      switch (e.key) {
        case 'Tab':
          e.preventDefault()
          exitToList()
          break
        case 'Escape':
          e.preventDefault()
          setRovingIndex(null)
          regionRef.current?.focus()
          break
        case 'ArrowLeft':
          e.preventDefault()
          setRovingIndex((i) => Math.max(0, (i ?? 0) - 1))
          break
        case 'ArrowRight':
          e.preventDefault()
          setRovingIndex((i) =>
            Math.min(itemIds.length - 1, (i ?? 0) + 1),
          )
          break
        default:
          break
      }
    },
    [rovingIndex, exitToList, itemIds.length],
  )

  return (
    <div
      ref={regionRef}
      role="region"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={regionHintId}
      onKeyDown={handleRegionKeyDown}
      onKeyDownCapture={handleStripCapture}
      className="shrink-0 border-b border-gray-100 px-1 py-2 outline-none focus-visible:ring-2 focus-visible:ring-gray-200 focus-visible:ring-offset-2 dark:border-zinc-800 dark:focus-visible:ring-zinc-600 dark:focus-visible:ring-offset-zinc-950 rounded-md"
    >
      {useHorizontalScroll ? (
        <div className="px-2 py-1">
          <HorizontalScrollWithFades
            className="items-center"
            fadeBackground={fadeBackground}
            chevronsTabbable={false}
          >
            {children(api)}
          </HorizontalScrollWithFades>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 px-2 pb-3 pt-1">{children(api)}</div>
      )}
    </div>
  )
}
