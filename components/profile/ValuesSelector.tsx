import { useMemo, useState } from 'react'
import Chevron from '@/components/Chevron'
import { Checkbox } from '@/components/ui/Checkbox'
import type { WorkValue } from '@/lib/values'

export type { WorkValue }

interface ValuesSelectorProps {
  values: WorkValue[]
  selected: string[]
  onToggle: (id: string) => void
  onToggleMultiple?: (ids: string[], shouldSelect: boolean) => void
  locale: 'en' | 'fr'
}

export default function ValuesSelector({
  values,
  selected,
  onToggle,
  onToggleMultiple,
  locale,
}: ValuesSelectorProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  // Group by category label
  const groups = useMemo(() => {
    const map = new Map<string, WorkValue[]>()
    for (const v of values) {
      const cat = v.category[locale]
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(v)
    }
    return Array.from(map.entries())
  }, [values, locale])

  const handleCategoryToggle = (items: WorkValue[], isAllSelected: boolean) => {
    if (!onToggleMultiple) return
    const ids = items.map(i => i.id)
    onToggleMultiple(ids, !isAllSelected)
  }

  return (
    <div className="space-y-4">
      {groups.map(([category, items]) => {
        const isExpanded = expandedCategories.has(category)
        const categorySelectedItems = items.filter(i => selectedSet.has(i.id))
        const isAllSelected = categorySelectedItems.length === items.length
        const isPartialSelected = categorySelectedItems.length > 0 && !isAllSelected
        
        return (
          <div key={category} className="border border-gray-100 rounded-xl overflow-hidden bg-white shadow-sm transition-all hover:border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-700">
            {/* Category header */}
            <div className={`flex items-center px-4 py-3 gap-3 transition-colors ${isExpanded ? 'bg-gray-50 border-b border-gray-100 dark:bg-zinc-800 dark:border-zinc-700' : 'bg-gray-50 dark:bg-zinc-800'}`}>
              
              {/* Category-level master toggle (on the left) */}
              {onToggleMultiple && (
                <button
                  type="button"
                  onClick={() => handleCategoryToggle(items, isAllSelected)}
                  className="p-1 active:scale-90 transition-transform"
                >
                  <Checkbox 
                    checked={isAllSelected}
                    indeterminate={isPartialSelected}
                    readOnly
                  />
                </button>
              )}

              {/* Labels and click-to-expand region */}
              <div 
                className="flex-1 min-w-0 flex items-center justify-between cursor-pointer select-none"
                onClick={() => toggleCategory(category)}
              >
                <div className="flex flex-col">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-300">
                    {category}
                  </p>
                  <p className="text-[10px] font-medium text-gray-400 dark:text-gray-400">
                    {categorySelectedItems.length} / {items.length} {locale === 'fr' ? 'sélectionnés' : 'selected'}
                  </p>
                </div>

                {/* Chevron on the right */}
                <div className="text-gray-400 dark:text-gray-400 shrink-0 transform transition-transform duration-200">
                  <Chevron rotated={isExpanded} />
                </div>
              </div>
            </div>

            {/* Value rows */}
            {isExpanded && (
              <div className="bg-white dark:bg-zinc-900">
                {items.map((value, idx) => {
                  const isSelected = selectedSet.has(value.id)
                  return (
                    <div key={value.id}>
                      {idx > 0 && <hr className="border-gray-50 dark:border-zinc-700/50" />}
                      <button
                        type="button"
                        onClick={() => onToggle(value.id)}
                        className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/80 active:bg-gray-100 dark:hover:bg-zinc-800/50 dark:active:bg-zinc-800"
                        style={{ minHeight: '44px' }}
                      >
                        <Checkbox 
                          checked={isSelected}
                          readOnly
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-[13px] font-bold ${
                              isSelected ? 'text-gray-800 dark:text-zinc-100' : 'text-gray-800 dark:text-zinc-100'
                            }`}
                          >
                            {value.label[locale]}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-gray-500 line-clamp-2">
                            {value.summary[locale]}
                          </p>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
