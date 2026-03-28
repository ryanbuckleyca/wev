'use client'

import { useMemo, useRef, useState } from 'react'
import { Search, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Checkbox } from '@/components/ui/Checkbox'
import SortableSelectedList from './SortableSelectedList'
import SelectedValuesPills from './values/SelectedValuesPills'
import SelectionBrowseModal from './SelectionBrowseModal'
import type { WorkValue } from '@/lib/values'
import type { RatedValue } from '@/lib/value-ratings'

export type { WorkValue }

interface ValuesSelectorProps {
  values: WorkValue[]
  /** Defaults to [] when omitted (e.g. tests or partial props). */
  selectedValues?: string[]
  valueCutoff: number
  onReorder: (from: number, to: number) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  locale: 'en' | 'fr'
  valuesRated?: RatedValue[]
}

function ValueRow({
  value, locale, isSelected, onToggle,
}: { value: WorkValue; locale: 'en' | 'fr'; isSelected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-start gap-4 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/80 active:bg-gray-100 dark:hover:bg-zinc-800/50 dark:active:bg-zinc-800"
      style={{ minHeight: '44px' }}
    >
      <Checkbox checked={isSelected} readOnly className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-gray-800 dark:text-zinc-100">{value.label[locale]}</p>
        <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-gray-500 dark:text-zinc-400 line-clamp-2">{value.summary[locale]}</p>
      </div>
    </button>
  )
}

function ValuesBrowse({
  values, selectedSet, query, locale, onToggle,
}: {
  values: WorkValue[]
  selectedSet: Set<string>
  query: string
  locale: 'en' | 'fr'
  onToggle: (id: string) => void
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const toggleCategory = (cat: string) =>
    setExpandedCategories(prev => { const next = new Set(prev); next.has(cat) ? next.delete(cat) : next.add(cat); return next })

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return values
    return values.filter(v => v.label[locale].toLowerCase().includes(q) || v.summary[locale].toLowerCase().includes(q))
  }, [values, query, locale])

  if (filtered.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-zinc-500">No values match.</p>
  }

  if (query) {
    return (
      <>
        {filtered.map((value, idx) => (
          <div key={value.id}>
            {idx > 0 && <hr className="border-gray-50 dark:border-zinc-800/60" />}
            <ValueRow value={value} locale={locale} isSelected={selectedSet.has(value.id)} onToggle={() => onToggle(value.id)} />
          </div>
        ))}
      </>
    )
  }

  // Grouped accordions
  const groups = new Map<string, WorkValue[]>()
  for (const v of filtered) {
    const cat = v.category[locale]
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(v)
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-zinc-800">
      {Array.from(groups.entries()).map(([cat, items]) => {
        const isExpanded = expandedCategories.has(cat)
        const selectedCount = items.filter(v => selectedSet.has(v.id)).length
        return (
          <div key={cat} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCategory(cat)}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 bg-white hover:bg-gray-50 dark:bg-zinc-950 dark:hover:bg-zinc-900 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-semibold text-gray-900 dark:text-zinc-100">{cat}</span>
                {selectedCount > 0 && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-100 px-1.5 text-[11px] font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                    {selectedCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-gray-400 dark:text-zinc-500">
                <span className="text-[12px]">{items.length} {items.length === 1 ? 'value' : 'values'}</span>
                <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </div>
            </button>
            {isExpanded && (
              <div className="bg-white dark:bg-zinc-900 border-t border-gray-50 dark:border-zinc-800/50">
                {items.map((value, idx) => (
                  <div key={value.id}>
                    {idx > 0 && <hr className="border-gray-50 dark:border-zinc-800/60" />}
                    <ValueRow value={value} locale={locale} isSelected={selectedSet.has(value.id)} onToggle={() => onToggle(value.id)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const browseTriggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const selectedIdsOrdered = useMemo(() => [...selectedValues], [selectedValues])
  const valuesBrowseRef = useRef<HTMLDivElement>(null)
  const VALUES_SELECTED_HINT_ID = 'profile-values-selected-hint'

  const valueMap = useMemo(() => {
    const m = new Map<string, WorkValue>()
    for (const v of values) m.set(v.id, v)
    return m
  }, [values])

  const sortableItems = useMemo(() =>
    selectedValues.map(id => {
      const v = valueMap.get(id)
      if (!v) return null
      return { id, label: v.label[locale], sublabel: v.summary[locale] }
    }).filter(Boolean) as { id: string; label: string; sublabel: string }[],
    [selectedValues, valueMap, locale]
  )

  const selectedSection = sortableItems.length > 0 && (
    <SortableSelectedList
      variant="values"
      items={sortableItems}
      rankCutoff={valueCutoff}
      onReorder={onReorder}
      onRemove={onRemove}
    />
  )

  const handleCloseModal = () => {
    setQuery('')
    setMobileOpen(false)
  }

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
      <SelectionBrowseModal
        isOpen={mobileOpen}
        onClose={handleCloseModal}
        searchInputRef={searchInputRef}
        returnFocusRef={browseTriggerRef}
        dialogAriaLabel={t('valuesBrowseDialogLabel')}
        backAriaLabel={t('valuesBack')}
        doneLabel={t('valuesDone')}
        selectedCount={selectedSet.size}
        headerCenter={
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('valuesPlaceholderShort')}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 pl-9 pr-4 py-2 text-base font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 md:text-[13px]"
            />
          </div>
        }
        selectedPills={
          selectedSet.size > 0 ? (
            <div className="px-3 pt-2 shrink-0">
              <span id={VALUES_SELECTED_HINT_ID} className="sr-only">
                {t('valuesSelectedRegionHint')}
              </span>
              <SelectedValuesPills
                values={values}
                selectedIds={selectedIdsOrdered}
                onRemove={onRemove}
                locale={locale}
                useHorizontalScroll={!!query}
                fadeBackground="var(--card)"
                resultsListRef={valuesBrowseRef}
                regionHintId={VALUES_SELECTED_HINT_ID}
              />
            </div>
          ) : undefined
        }
      >
        <div
          ref={valuesBrowseRef}
          id="profile-values-browse"
          tabIndex={0}
          className="min-h-0 outline-none focus-visible:ring-2 focus-visible:ring-gray-200 focus-visible:ring-inset dark:focus-visible:ring-zinc-600"
        >
          <ValuesBrowse
            values={values}
            selectedSet={selectedSet}
            query={query}
            locale={locale}
            onToggle={onToggle}
          />
        </div>
      </SelectionBrowseModal>
    </div>
  )
}
