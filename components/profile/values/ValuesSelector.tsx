'use client'

import { useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import ValuesModal from './ValuesModal'
import SortableSelectedList from '../SortableSelectedList'
import type { WorkValue } from '@/lib/values'
import type { RatedValue } from '@/lib/value-ratings'

export type { WorkValue }

interface ValuesSelectorProps {
  values: WorkValue[]
  selectedValues?: string[]
  valueCutoff: number
  onReorder: (from: number, to: number) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  locale: 'en' | 'fr'
  valuesRated?: RatedValue[]
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
  const browseTriggerRef = useRef<HTMLButtonElement>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
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

  const handleQueryChange = (value: string) => {
    setQuery(value)
  }

  const handleClearQuery = () => {
    setQuery('')
  }

  const handleMobileClose = () => {
    setQuery('')
    setMobileOpen(false)
  }

  const selectedSection = sortableItems.length > 0 && (
    <SortableSelectedList
      variant="values"
      items={sortableItems}
      rankCutoff={valueCutoff}
      onReorder={onReorder}
      onRemove={onRemove}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <button
        ref={browseTriggerRef}
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={mobileOpen}
        aria-label={t('valuesModalTriggerLabel')}
        className="flex w-full items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-left transition-all hover:border-gray-200 dark:bg-zinc-900/50 dark:border-zinc-800 dark:hover:border-zinc-700"
      >
        <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <span className="min-w-0 flex-1 text-[13px] font-medium text-gray-400" aria-hidden>
          {t('valuesPlaceholder')}
        </span>
      </button>
      {selectedSection}
      <ValuesModal
        isOpen={mobileOpen}
        onClose={handleMobileClose}
        returnFocusRef={browseTriggerRef}
        query={query}
        onQueryChange={handleQueryChange}
        onClearQuery={handleClearQuery}
        values={values}
        selectedIds={selectedValues}
        onToggle={onToggle}
        onRemove={onRemove}
        locale={locale}
      />
    </div>
  )
}
