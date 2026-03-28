'use client'

import { useTranslations } from 'next-intl'
import Pill from '@/components/Pill'
import ModalSelectedStrip from '../ModalSelectedStrip'
import { useListbox } from '../useListbox'
import type { WorkValue } from '@/lib/values'

const OPT_PREFIX = 'values-pill'

interface SelectedValuesPillsProps {
  values: WorkValue[]
  selectedIds: string[]
  onRemove: (id: string) => void
  locale: 'en' | 'fr'
  useHorizontalScroll?: boolean
  fadeBackground?: string
  regionHintId: string
}

export default function SelectedValuesPills({
  values,
  selectedIds,
  onRemove,
  locale,
  useHorizontalScroll = false,
  fadeBackground = 'var(--card)',
  regionHintId,
}: SelectedValuesPillsProps) {
  const t = useTranslations('ariaLabels.pill')
  const tProfile = useTranslations('profile')

  const selectedValues = selectedIds
    .map((id) => values.find((v) => v.id === id))
    .filter(Boolean) as WorkValue[]

  const { activeIndex, activeDescendant, handleKeyDown } = useListbox(selectedValues.length, OPT_PREFIX, true)

  if (selectedValues.length === 0) return null

  return (
    <ModalSelectedStrip
      regionHintId={regionHintId}
      ariaLabel={tProfile('valuesSelectedRegionLabel', { count: selectedValues.length })}
      useHorizontalScroll={useHorizontalScroll}
      fadeBackground={fadeBackground}
      listboxProps={{
        role: 'listbox',
        tabIndex: 0,
        'aria-activedescendant': activeDescendant,
        'aria-orientation': 'horizontal',
      }}
      onSectionKeyDown={(e) => handleKeyDown(e, (i) => onRemove(selectedValues[i].id), (i) => onRemove(selectedValues[i].id))}
    >
      {selectedValues.map((v, i) => (
        <div
          key={v.id}
          id={`${OPT_PREFIX}-${i}`}
          role="option"
          aria-selected
          className={`shrink-0 inline-flex rounded-full ${i === activeIndex ? 'ring-2 ring-blue-400/60' : ''}`}
        >
          <Pill
            size="sm"
            onRemove={() => onRemove(v.id)}
            removeAriaLabel={t('remove', { label: v.label[locale] })}
            removeTabIndex={-1}
            className="md:py-1 shrink-0"
          >
            {v.label[locale]}
          </Pill>
        </div>
      ))}
    </ModalSelectedStrip>
  )
}
