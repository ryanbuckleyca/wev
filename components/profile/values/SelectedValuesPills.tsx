'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import HorizontalScrollWithFades from '@/components/ui/HorizontalScrollWithFades'
import Pill from '@/components/Pill'
import ModalSelectedStrip, { type ModalStripApi } from '../ModalSelectedStrip'
import type { WorkValue } from '@/lib/values'
import type { RefObject } from 'react'

interface SelectedValuesPillsProps {
  values: WorkValue[]
  selectedIds: string[]
  onRemove: (id: string) => void
  locale: 'en' | 'fr'
  useHorizontalScroll?: boolean
  fadeBackground?: string
  resultsListRef?: RefObject<HTMLElement | null>
  regionHintId?: string
}

export default function SelectedValuesPills({
  values,
  selectedIds,
  onRemove,
  locale,
  useHorizontalScroll = false,
  fadeBackground = 'var(--card)',
  resultsListRef,
  regionHintId,
}: SelectedValuesPillsProps) {
  const t = useTranslations('ariaLabels.pill')
  const tProfile = useTranslations('profile')
  const composite = Boolean(resultsListRef)
  const itemIds = useMemo(() => [...selectedIds], [selectedIds])

  const selectedValues = selectedIds
    .map((id) => values.find((v) => v.id === id))
    .filter(Boolean) as WorkValue[]

  if (selectedValues.length === 0) return null

  const renderPills = (api: ModalStripApi | null) => {
    const comp = api !== null
    const roving = api?.rovingIndex ?? null
    const setRemoveRef = api?.setRemoveRef ?? (() => () => {})
    return selectedValues.map((v, index) => (
      <Pill
        key={v.id}
        size="sm"
        onRemove={() => onRemove(v.id)}
        removeAriaLabel={t('remove', { label: v.label[locale] })}
        removeTabIndex={comp ? (roving === index ? 0 : -1) : undefined}
        removeRef={comp ? setRemoveRef(v.id) : undefined}
        className="md:py-1 shrink-0"
      >
        {v.label[locale]}
      </Pill>
    ))
  }

  if (!composite) {
    const pillElements = renderPills(null)
    if (useHorizontalScroll) {
      return (
        <div className="shrink-0 border-b border-gray-100 pb-2 dark:border-zinc-800">
          <HorizontalScrollWithFades
            className="items-center"
            fadeBackground={fadeBackground}
            chevronsTabbable
          >
            {pillElements}
          </HorizontalScrollWithFades>
        </div>
      )
    }
    return (
      <div className="flex flex-wrap gap-2 pb-3 pt-1">{pillElements}</div>
    )
  }

  return (
    <ModalSelectedStrip
      itemIds={itemIds}
      resultsListRef={resultsListRef!}
      regionHintId={regionHintId}
      ariaLabel={tProfile('valuesSelectedRegionLabel', {
        count: selectedValues.length,
      })}
      useHorizontalScroll={useHorizontalScroll}
      fadeBackground={fadeBackground}
    >
      {(api) => renderPills(api)}
    </ModalSelectedStrip>
  )
}
