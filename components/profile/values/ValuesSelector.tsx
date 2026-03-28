'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import BrowseTrigger from '../BrowseTrigger'
import ValuesModal from './ValuesModal'
import SortableSelectedList from '../SortableSelectedList'
import type { WorkValue } from '@/lib/values'

export type { WorkValue }

interface ValuesSelectorProps {
  values: WorkValue[]
  selectedValues?: string[]
  valueCutoff: number
  onReorder: (from: number, to: number, newCutoff?: number) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  locale: 'en' | 'fr'
}

export default function ValuesSelector({
  values,
  selectedValues = [],
  valueCutoff,
  onReorder,
  onToggle,
  onRemove,
  locale,
}: ValuesSelectorProps) {
  const t = useTranslations('profile')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const valueMap = new Map<string, WorkValue>()
  for (const v of values) valueMap.set(v.id, v)

  const sortableItems = selectedValues
    .map((id) => {
      const v = valueMap.get(id)
      if (!v) return null
      return { id, label: v.label[locale], sublabel: v.summary[locale] }
    })
    .filter(Boolean) as { id: string; label: string; sublabel: string }[]

  const handleClose = () => {
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <BrowseTrigger
        onClick={() => setOpen(true)}
        isOpen={open}
        ariaLabel={t('valuesModalTriggerLabel')}
        placeholder={t('valuesPlaceholder')}
      />
      {sortableItems.length > 0 && (
        <SortableSelectedList
          variant="values"
          items={sortableItems}
          rankCutoff={valueCutoff}
          onReorder={onReorder}
          onRemove={onRemove}
        />
      )}
      <ValuesModal
        isOpen={open}
        onClose={handleClose}
        query={query}
        onQueryChange={setQuery}
        onClearQuery={() => setQuery('')}
        values={values}
        selectedIds={selectedValues}
        onToggle={onToggle}
        onRemove={onRemove}
        locale={locale}
      />
    </div>
  )
}
