'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import { useMediaQuery } from '@/hooks/useMediaQuery'

const HEADER_OFFSET_REM = '5.75rem'

export interface SelectionBrowseModalProps {
  isOpen: boolean
  onClose: () => void
  searchInputRef?: RefObject<HTMLInputElement | null>
  returnFocusRef?: RefObject<HTMLElement | null>
  dialogAriaLabel: string
  backAriaLabel: string
  doneLabel: string
  selectedCount: number
  headerCenter: ReactNode
  selectedPills?: ReactNode
  children: ReactNode
}

export default function SelectionBrowseModal({
  isOpen,
  onClose,
  searchInputRef,
  returnFocusRef,
  dialogAriaLabel,
  backAriaLabel,
  doneLabel,
  selectedCount,
  headerCenter,
  selectedPills,
  children,
}: SelectionBrowseModalProps) {
  const isMobile = !useMediaQuery('(min-width: 768px)')
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 600 : (window.visualViewport?.height ?? window.innerHeight)
  )

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const returnFocusRefStable = useRef(returnFocusRef)
  returnFocusRefStable.current = returnFocusRef

  useEffect(() => {
    if (!isOpen) return

    const savedY = window.scrollY
    const updateHeight = () => setViewportHeight(window.visualViewport?.height ?? window.innerHeight)

    // Lock scroll
    if (isMobile) {
      document.body.style.cssText = `position:fixed;top:-${savedY}px;width:100%;overflow:hidden`
    } else {
      document.body.style.overflow = 'hidden'
    }
    document.documentElement.style.overflow = 'hidden'

    // Focus search input after layout settles
    setTimeout(() => {
      if (isMobile) updateHeight()
      searchInputRef?.current?.focus({ preventScroll: true })
    }, 50)

    // Track viewport resize (mobile virtual keyboard)
    const vp = isMobile ? window.visualViewport : null
    if (vp) {
      vp.addEventListener('resize', updateHeight)
      vp.addEventListener('scroll', updateHeight)
    } else if (isMobile) {
      window.addEventListener('resize', updateHeight)
    }

    // Escape to close
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (vp) {
        vp.removeEventListener('resize', updateHeight)
        vp.removeEventListener('scroll', updateHeight)
      } else if (isMobile) {
        window.removeEventListener('resize', updateHeight)
      }

      // Unlock scroll
      document.body.style.cssText = ''
      document.documentElement.style.overflow = ''

      requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, behavior: 'auto' })
        returnFocusRefStable.current?.current?.focus({ preventScroll: true })
      })
    }
  }, [isOpen, isMobile, searchInputRef])

  if (!isOpen || typeof document === 'undefined') return null

  const inner = (
    <>
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-3 bg-card dark:border-zinc-800 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-gray-600 dark:text-gray-400"
          aria-label={backAriaLabel}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">{headerCenter}</div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"
          style={{ color: 'var(--info-solid)' }}
        >
          {doneLabel}
          {selectedCount > 0 && (
            <span
              className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: 'var(--info-solid)' }}
            >
              {selectedCount}
            </span>
          )}
        </button>
      </div>

      {selectedPills}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">{children}</div>
    </>
  )

  const desktopCardStyle: CSSProperties = {
    height: 'min(800px, calc(100dvh - 7.25rem))',
    maxHeight: 'min(800px, calc(100dvh - 7.25rem))',
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998] hidden bg-black/40 backdrop-blur-sm md:block"
        onClick={onClose}
        aria-hidden
      />
      {isMobile ? (
        <div
          style={{ height: `${viewportHeight}px`, width: '100vw', maxWidth: '100%', position: 'fixed', left: 0, top: 0 }}
          className="z-[9999] fixed flex w-full flex-col overflow-hidden bg-card inset-0"
          role="dialog"
          aria-modal="true"
          aria-label={dialogAriaLabel}
        >
          {inner}
        </div>
      ) : (
        <div
          className="fixed inset-0 z-[9999] hidden md:flex md:items-center md:justify-center md:p-4 pointer-events-none"
          style={{ paddingTop: `calc(${HEADER_OFFSET_REM} + 0.5rem)`, paddingBottom: '1rem' }}
        >
          <div
            className="flex w-full max-w-[600px] flex-col overflow-hidden bg-card rounded-2xl border border-gray-200 shadow-2xl dark:border-zinc-800 pointer-events-auto"
            style={desktopCardStyle}
            role="dialog"
            aria-modal="true"
            aria-label={dialogAriaLabel}
          >
            {inner}
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
