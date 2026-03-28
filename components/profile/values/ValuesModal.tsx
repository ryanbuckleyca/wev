'use client'

import { useRef, useState, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { Checkbox } from '@/components/ui/Checkbox'
import Chevron from '@/components/Chevron'
import { useListbox } from '../useListbox'
import SearchInput from '../SearchInput'
import SelectedValuesPills from './SelectedValuesPills'
import SelectionBrowseModal from '../SelectionBrowseModal'
import type { WorkValue } from '@/lib/values'

const VALUES_LISTBOX_ID = 'profile-values-listbox'
const VALUES_SELECTED_HINT_ID = 'profile-values-selected-hint'

type Row =
  | { kind: 'group'; category: string; count: number; selectedCount: number }
  | { kind: 'item'; value: WorkValue }

function ValuesBrowse({
  values,
  selectedSet,
  query,
  locale,
  onToggle,
  listboxId,
  listboxAriaLabel,
}: {
  values: WorkValue[]
  selectedSet: Set<string>
  query: string
  locale: 'en' | 'fr'
  onToggle: (id: string) => void
  listboxId: string
  listboxAriaLabel: string
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const q = query.toLowerCase().trim()
  const filtered = q
    ? values.filter(
        (v) =>
          v.label[locale].toLowerCase().includes(q) ||
          v.summary[locale].toLowerCase().includes(q),
      )
    : values

  if (filtered.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-zinc-500">No values match.</p>
  }

  const grouped = new Map<string, WorkValue[]>()
  for (const v of filtered) {
    const cat = v.category[locale]
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(v)
  }

  const rows: Row[] = []
  Array.from(grouped.entries()).forEach(([cat, items]) => {
    rows.push({
      kind: 'group',
      category: cat,
      count: items.length,
      selectedCount: items.filter((v: WorkValue) => selectedSet.has(v.id)).length,
    })
    if (!collapsed.has(cat)) {
      items.forEach((item) => rows.push({ kind: 'item', value: item }))
    }
  })

  const optPrefix = `${listboxId}-opt`
  const { activeIndex, activeDescendant, setActive, handleKeyDown } = useListbox(rows.length, optPrefix)

  function activate(i: number) {
    const row = rows[i]
    if (row.kind === 'group') {
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.has(row.category) ? next.delete(row.category) : next.add(row.category)
        return next
      })
    } else {
      onToggle(row.value.id)
    }
  }

  return (
    <div
      id={listboxId}
      role="listbox"
      tabIndex={0}
      aria-label={listboxAriaLabel}
      aria-activedescendant={activeDescendant}
      onKeyDown={(e) => handleKeyDown(e, activate)}
      className="overflow-x-hidden pb-2 rounded-md focus:outline-none"
    >
      {rows.map((row, i) => {
        const active = i === activeIndex
        if (row.kind === 'group') {
          return (
            <div
              key={`g-${row.category}`}
              id={`${optPrefix}-${i}`}
              role="option"
              aria-selected={false}
              onClick={() => { setActive(i); activate(i) }}
              className={`cursor-pointer px-4 py-3 border-b border-gray-50 dark:border-zinc-800/60 ${
                active ? 'bg-blue-50/60 dark:bg-blue-900/20' : 'hover:bg-gray-50/80 dark:hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[14px] font-semibold text-gray-900 dark:text-zinc-100 truncate">
                    {row.category}
                  </span>
                  <span className="text-xs font-semibold tabular-nums rounded-full px-2.5 py-0.5 bg-muted text-muted-foreground dark:bg-zinc-800 dark:text-zinc-400">
                    {row.selectedCount}/{row.count}
                  </span>
                </div>
                <Chevron rotated={!collapsed.has(row.category)} size={14} className="text-gray-400 dark:text-zinc-500" />
              </div>
            </div>
          )
        }
        const v = row.value
        return (
          <div
            key={v.id}
            id={`${optPrefix}-${i}`}
            role="option"
            aria-selected={selectedSet.has(v.id)}
            onClick={() => { setActive(i); activate(i) }}
            className={`flex cursor-pointer items-start gap-4 pl-8 pr-4 py-3.5 transition-colors ${
              active ? 'bg-blue-50/60 dark:bg-blue-900/20' : 'hover:bg-gray-50/80 dark:hover:bg-zinc-800/50'
            }`}
          >
            <Checkbox checked={selectedSet.has(v.id)} readOnly tabIndex={-1} aria-hidden className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-gray-800 dark:text-zinc-100">{v.label[locale]}</p>
              <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-gray-500 dark:text-zinc-400 line-clamp-2">
                {v.summary[locale]}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface ValuesModalProps {
  isOpen: boolean
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
  query: string
  onQueryChange: (value: string) => void
  onClearQuery: () => void
  values: WorkValue[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  locale: 'en' | 'fr'
}

export default function ValuesModal({
  isOpen,
  onClose,
  returnFocusRef,
  query,
  onQueryChange,
  onClearQuery,
  values,
  selectedIds,
  onToggle,
  onRemove,
  locale,
}: ValuesModalProps) {
  const t = useTranslations('profile')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedSet = new Set(selectedIds)

  return (
    <SelectionBrowseModal
      isOpen={isOpen}
      onClose={onClose}
      searchInputRef={inputRef}
      returnFocusRef={returnFocusRef}
      dialogAriaLabel={t('valuesBrowseDialogLabel')}
      backAriaLabel={t('valuesBack')}
      doneLabel={t('valuesDone')}
      selectedCount={selectedSet.size}
      headerCenter={
        <SearchInput
          query={query}
          onQueryChange={onQueryChange}
          inputRef={inputRef}
          onClear={onClearQuery}
          placeholder={t('valuesPlaceholderShort')}
          listboxId={VALUES_LISTBOX_ID}
        />
      }
      selectedPills={
        selectedSet.size > 0 ? (
          <>
            <span id={VALUES_SELECTED_HINT_ID} className="sr-only">
              {t('valuesSelectedRegionHint')}
            </span>
            <SelectedValuesPills
              values={values}
              selectedIds={selectedIds}
              onRemove={onRemove}
              locale={locale}
              useHorizontalScroll={!!query}
              fadeBackground="var(--card)"
              regionHintId={VALUES_SELECTED_HINT_ID}
            />
          </>
        ) : undefined
      }
    >
      <div className="min-h-0">
        <ValuesBrowse
          values={values}
          selectedSet={selectedSet}
          query={query}
          locale={locale}
          onToggle={onToggle}
          listboxId={VALUES_LISTBOX_ID}
          listboxAriaLabel={t('valuesListboxLabel')}
        />
      </div>
    </SelectionBrowseModal>
  )
}
