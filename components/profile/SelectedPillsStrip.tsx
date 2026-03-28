'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import Pill from '@/components/Pill'
import ModalSelectedStrip from './ModalSelectedStrip'
import { useListbox } from './useListbox'

interface PillItem {
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

  return (
    <ModalSelectedStrip
      regionHintId={regionHintId}
      ariaLabel={ariaLabel}
      useHorizontalScroll={useHorizontalScroll}
      fadeBackground={fadeBackground}
      listboxProps={{
        role: 'listbox',
        tabIndex: 0,
        'aria-activedescendant': activeDescendant,
        'aria-orientation': 'horizontal',
      }}
      onSectionKeyDown={(e) => handleKeyDown(e, (i) => onRemove(items[i].removeArg), (i) => onRemove(items[i].removeArg))}
    >
      {items.map((item, i) => {
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
            className={`shrink-0 inline-flex rounded-full ${i === activeIndex ? 'ring-2 ring-blue-400/60' : ''}`}
          >
            {wrapPill ? wrapPill(pill, item, i) : pill}
          </div>
        )
      })}
    </ModalSelectedStrip>
  )
}
