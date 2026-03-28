'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/** Keep a stable ref so the open/lock effect doesn't re-run when the caller re-renders. */
function useStableRef<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

/** Matches `Header`: py-4 + ~60px logo + border — keeps modal below the fixed site header on desktop */
const HEADER_OFFSET_REM = '5.75rem'

export interface SelectionBrowseModalProps {
  isOpen: boolean
  onClose: () => void
  /** Primary search input ref — focused when the modal opens (desktop + mobile keyboard) */
  searchInputRef?: RefObject<HTMLInputElement | null>
  /** Focus returns here when the modal closes (dialog pattern). */
  returnFocusRef?: RefObject<HTMLElement | null>
  /** Accessible name for the dialog surface (`role="dialog"`). */
  dialogAriaLabel: string
  backAriaLabel: string
  doneLabel: string
  selectedCount: number
  /** Search / filter control (typically flex-1) */
  headerCenter: ReactNode
  selectedPills?: ReactNode
  /**
   * When true, selectedPills render below the scrollable list instead of above.
   * Improves keyboard tab order (reach results before selected chips) for pickers
   * that use a focusable list inside children (e.g. skills listbox).
   */
  selectedPillsAfterList?: boolean
  children: ReactNode
}

/**
 * Shared shell for profile “browse & select” flows: full-screen on narrow viewports,
 * centered card from `md` breakpoint up (matches Tailwind `md:` = 768px).
 */
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
  selectedPillsAfterList = false,
  children,
}: SelectionBrowseModalProps) {
  const isMdUp = useMediaQuery('(min-width: 768px)')
  const useMobileFullScreenShell = !isMdUp
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 600 : (window.visualViewport?.height ?? window.innerHeight)
  )
  /** Scroll position before modal opened — restored on close (do not scroll-to-top on open). */
  const savedScrollYRef = useRef(0)

  const mobileShellClassName =
    'z-[9999] fixed flex w-full flex-col overflow-hidden bg-card inset-0'

  /** Desktop card: height fits under fixed header + wrapper padding (inline — avoids Tailwind purge issues) */
  const desktopCardStyle: CSSProperties = {
    height: 'min(800px, calc(100dvh - 7.25rem))',
    maxHeight: 'min(800px, calc(100dvh - 7.25rem))',
  }
  const desktopCardClassName =
    'flex w-full max-w-[600px] flex-col overflow-hidden bg-card rounded-2xl border border-gray-200 shadow-2xl dark:border-zinc-800 pointer-events-auto'

  useEffect(() => {
    if (!useMobileFullScreenShell) return
    const update = () => {
      setViewportHeight(window.visualViewport?.height ?? window.innerHeight)
    }
    update()
    const vp = window.visualViewport
    if (vp) {
      vp.addEventListener('resize', update)
      vp.addEventListener('scroll', update)
      return () => {
        vp.removeEventListener('resize', update)
        vp.removeEventListener('scroll', update)
      }
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [useMobileFullScreenShell])

  const onCloseRef = useStableRef(onClose)
  const returnFocusRefStable = useStableRef(returnFocusRef)

  useEffect(() => {
    if (!isOpen) return

    savedScrollYRef.current = window.scrollY

    const focusSearch = () => {
      searchInputRef?.current?.focus({ preventScroll: true })
    }
    if (useMobileFullScreenShell) {
      const y = savedScrollYRef.current
      document.body.style.cssText = `position:fixed;top:-${y}px;width:100%;overflow:hidden`
      document.documentElement.style.overflow = 'hidden'
      setTimeout(() => {
        setViewportHeight(window.visualViewport?.height ?? window.innerHeight)
        focusSearch()
      }, 50)
    } else {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      setTimeout(focusSearch, 50)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      const restoreY = savedScrollYRef.current
      if (useMobileFullScreenShell) {
        document.body.style.cssText = ''
        document.documentElement.style.overflow = ''
      } else {
        document.body.style.overflow = ''
        document.documentElement.style.overflow = ''
      }
      requestAnimationFrame(() => {
        window.scrollTo({ top: restoreY, left: 0, behavior: 'auto' })
        returnFocusRefStable.current?.current?.focus({ preventScroll: true })
      })
    }
  }, [isOpen, useMobileFullScreenShell, searchInputRef, onCloseRef, returnFocusRefStable])

  if (!isOpen) return null

  if (typeof document === 'undefined') return null

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

      {selectedPillsAfterList ? (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">{children}</div>
          {selectedPills}
        </>
      ) : (
        <>
          {selectedPills}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">{children}</div>
        </>
      )}
    </>
  )

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998] hidden bg-black/40 backdrop-blur-sm md:block"
        onClick={onClose}
        aria-hidden
      />
      {useMobileFullScreenShell ? (
        <div
          style={{
            height: `${viewportHeight}px`,
            width: '100vw',
            maxWidth: '100%',
            position: 'fixed',
            left: 0,
            top: 0,
          }}
          className={mobileShellClassName}
          role="dialog"
          aria-modal="true"
          aria-label={dialogAriaLabel}
        >
          {inner}
        </div>
      ) : (
        <div
          className="fixed inset-0 z-[9999] hidden md:flex md:items-center md:justify-center md:p-4 pointer-events-none"
          style={{
            paddingTop: `calc(${HEADER_OFFSET_REM} + 0.5rem)`,
            paddingBottom: '1rem',
          }}
        >
          <div
            className={desktopCardClassName}
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
