'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import Pill from '@/components/Pill'
import HorizontalScrollWithFades from '@/components/ui/HorizontalScrollWithFades'
import { useListbox } from './useListbox'

export interface PillItem {
  key: string
  label: string
  removeArg: string
}

interface SelectedPillsStripProps {
  items: PillItem[]
  onRemove: (arg: string) => void
  ariaLabel: string
  optPrefix: string
  regionHintId: string
  useHorizontalScroll?: boolean
  fadeBackground?: string
  /** Wrap each pill (e.g. in an InfoPopover). Receives the Pill element and item index. */
  wrapPill?: (pill: ReactNode, item: PillItem, index: number) => ReactNode
}

export default function SelectedPillsStrip({
  items,
  onRemove,
  ariaLabel,
  optPrefix,
  regionHintId,
  useHorizontalScroll = false,
  fadeBackground = 'var(--card)',
  wrapPill,
}: SelectedPillsStripProps) {
  const t = useTranslations('ariaLabels.pill')
  const { activeIndex, activeDescendant, handleKeyDown } = useListbox(items.length, optPrefix, true)

  if (items.length === 0) return null

  const pills = items.map((item, i) => {
    const pill = (
      <Pill
        size="sm"
        onRemove={() => onRemove(item.removeArg)}
        removeAriaLabel={t('remove', { label: item.label })}
        removeTabIndex={-1}
        className="md:py-1 shrink-0"
      >
        {item.label}
      </Pill>
    )

    return (
      <div
        key={item.key}
        id={`${optPrefix}-${i}`}
        role="option"
        aria-selected
        className={`shrink-0 inline-flex rounded-full ${
          i === activeIndex ? 'group-focus-within:ring-2 group-focus-within:ring-blue-400/60' : ''
        }`}
      >
        {wrapPill ? wrapPill(pill, item, i) : pill}
      </div>
    )
  })

  return (
    <section
      role="listbox"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={regionHintId}
      aria-activedescendant={activeDescendant}
      aria-orientation="horizontal"
      onKeyDown={(e) => handleKeyDown(e, (i) => onRemove(items[i].removeArg), (i) => onRemove(items[i].removeArg))}
      className="group shrink-0 border-b border-gray-100 px-1 py-2 dark:border-zinc-800 rounded-md"
    >
      {useHorizontalScroll ? (
        <div className="px-2 py-1">
          <HorizontalScrollWithFades
            className="items-center"
            fadeBackground={fadeBackground}
            chevronsTabbable={false}
          >
            {pills}
          </HorizontalScrollWithFades>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 px-2 pb-3 pt-1">{pills}</div>
      )}
    </section>
  )
}
