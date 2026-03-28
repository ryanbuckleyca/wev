'use client'

import { useTranslations } from 'next-intl'
import SelectedPillsStrip from '../SelectedPillsStrip'
import type { WorkValue } from '@/lib/values'

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
  const t = useTranslations('profile')

  const items = selectedIds
    .map((id) => {
      const v = values.find((val) => val.id === id)
      if (!v) return null
      return { key: v.id, label: v.label[locale], removeArg: v.id }
    })
    .filter(Boolean) as { key: string; label: string; removeArg: string }[]

  return (
    <SelectedPillsStrip
      items={items}
      onRemove={onRemove}
      ariaLabel={t('valuesSelectedRegionLabel', { count: items.length })}
      optPrefix="values-pill"
      regionHintId={regionHintId}
      useHorizontalScroll={useHorizontalScroll}
      fadeBackground={fadeBackground}
    />
  )
}
