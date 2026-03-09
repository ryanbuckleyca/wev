'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { VALUES_LIST, getValueDefinition } from '@/lib/values'
import CommandSelector, { type Option, dedupeOptions } from '@/components/CommandSelector'

export type ValueOption = Option & {
  description: string
  example: string
}

type ValuesCommandSelectorProps = {
  selectedValues: ValueOption[]
  onValuesChange: (values: ValueOption[]) => void
  placeholder: string
  noResultsText: string
  maxSelections?: number
  maxSelectionsReachedText?: string
  softLimit?: number
  softLimitWarningText?: string
}

function normalizeValueText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export default function ValuesCommandSelector({
  selectedValues,
  onValuesChange,
  placeholder,
  noResultsText,
  maxSelections,
  maxSelectionsReachedText,
  softLimit,
  softLimitWarningText,
}: ValuesCommandSelectorProps) {
  const t = useTranslations('values')
  const [query, setQuery] = useState('')

  // Convert VALUES_LIST to ValueOption format with translations
  const allValueOptions: ValueOption[] = useMemo(() => {
    return VALUES_LIST.map((value) => {
      const valueName = t(`${value}.name`, { defaultValue: value })
      const details = getValueDefinition(value, {
        name: valueName,
        description: t(`${value}.description`),
        example: t(`${value}.example`),
      })

      // Create rich tooltip content
      const tooltipContent = (
        <div className="space-y-2 text-left">
          <div className="font-semibold text-[var(--foreground)]">{valueName}</div>
          <div className="text-[var(--foreground)]">{details.description}</div>
          {details.example && (
            <div className="text-xs text-[var(--muted-foreground)] italic">
              {details.example}
            </div>
          )}
        </div>
      )

      return {
        value,
        label: valueName,
        tooltip: tooltipContent,
        description: details.description,
        example: details.example,
      }
    })
  }, [t])

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    if (!query.trim()) {
      return allValueOptions
    }

    const normalizedQuery = normalizeValueText(query)
    return allValueOptions.filter((option) => {
      return (
        normalizeValueText(option.label).includes(normalizedQuery) ||
        normalizeValueText(option.description).includes(normalizedQuery) ||
        normalizeValueText(option.example).includes(normalizedQuery)
      )
    })
  }, [allValueOptions, query])

  const dedupedOptions = useMemo(() => {
    return dedupeOptions(filteredOptions)
  }, [filteredOptions])

  const renderOptionContent = (option: ValueOption, isSelected: boolean) => (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        className="wev-checkbox mt-0.5"
        checked={isSelected}
        readOnly
        tabIndex={-1}
        aria-label={option.label}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[var(--foreground)]">{option.label}</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{option.description}</p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">{option.example}</p>
      </div>
    </div>
  )

  return (
    <CommandSelector
      selectedOptions={selectedValues}
      onOptionsChange={onValuesChange}
      placeholder={placeholder}
      noResultsText={noResultsText}
      maxSelections={maxSelections}
      maxSelectionsReachedText={maxSelectionsReachedText}
      softLimit={softLimit}
      softLimitWarningText={softLimitWarningText}
      query={query}
      onQueryChange={setQuery}
      availableOptions={dedupedOptions}
      renderOptionContent={renderOptionContent}
    />
  )
}
