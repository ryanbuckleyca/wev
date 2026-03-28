'use client'

import type { KeyboardEvent, ReactNode } from 'react'
import HorizontalScrollWithFades from '@/components/ui/HorizontalScrollWithFades'

export interface ModalSelectedStripProps {
  regionHintId: string
  ariaLabel: string
  useHorizontalScroll?: boolean
  fadeBackground?: string
  onSectionKeyDown?: (e: KeyboardEvent<HTMLElement>) => void
  /** When set, the section becomes a listbox with single-tab-stop arrow navigation. */
  listboxProps?: {
    role: 'listbox'
    tabIndex: number
    'aria-activedescendant'?: string
    'aria-orientation'?: 'horizontal' | 'vertical'
  }
  children: ReactNode
}

export default function ModalSelectedStrip({
  regionHintId,
  ariaLabel,
  useHorizontalScroll = false,
  fadeBackground = 'var(--card)',
  onSectionKeyDown,
  listboxProps,
  children,
}: ModalSelectedStripProps) {
  return (
    <section
      aria-label={ariaLabel}
      aria-describedby={regionHintId}
      onKeyDown={onSectionKeyDown}
      className="shrink-0 border-b border-gray-100 px-1 py-2 dark:border-zinc-800 rounded-md"
      {...listboxProps}
    >
      {useHorizontalScroll ? (
        <div className="px-2 py-1">
          <HorizontalScrollWithFades
            className="items-center"
            fadeBackground={fadeBackground}
            chevronsTabbable={false}
          >
            {children}
          </HorizontalScrollWithFades>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 px-2 pb-3 pt-1">{children}</div>
      )}
    </section>
  )
}
