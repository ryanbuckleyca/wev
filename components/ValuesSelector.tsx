'use client'

import { useTranslations } from 'next-intl'
import { VALUES_LIST, getValueDefinition } from '@/lib/values'
import Pill from '@/components/Pill'
import ValuesCommandSelector, { type ValueOption } from '@/components/ValuesCommandSelector'

interface ValuesSelectorProps {
  selectedValues: string[]
  onValuesChange: (values: string[]) => void
  isEditing: boolean
}

export default function ValuesSelector({
  selectedValues,
  onValuesChange,
  isEditing,
}: ValuesSelectorProps) {
  const t = useTranslations('values')

  // Convert selectedValues (string[]) to ValueOption[] for the command selector
  const selectedValueOptions: ValueOption[] = selectedValues.map((value) => {
    const valueName = t(`${value}.name`, { defaultValue: value })
    const details = getValueDefinition(value, {
      name: valueName,
      description: t(`${value}.description`),
      example: t(`${value}.example`),
    })
    
    return {
      value,
      label: valueName,
      description: details.description,
      example: details.example,
    }
  })

  // Handle changes from ValuesCommandSelector and convert back to string[]
  const handleValueOptionsChange = (valueOptions: ValueOption[]) => {
    const newSelectedValues = valueOptions.map((option) => option.value)
    onValuesChange(newSelectedValues)
  }

  if (!isEditing) {
    if (selectedValues.length === 0) {
      return <p className="text-[var(--text-tertiary)]">-</p>
    }

    return (
      <div className="space-y-3">
        {selectedValues.map((value) => {
          const valueName = t(`${value}.name`, { defaultValue: value })
          const details = getValueDefinition(value, {
            name: valueName,
            description: t(`${value}.description`),
            example: t(`${value}.example`),
          })

          return (
            <div
              key={value}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <Pill>{valueName}</Pill>
              </div>
              <p className="text-sm text-[var(--text-primary)]">
                {details.description}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {details.example}
              </p>
            </div>
          )
        })}
      </div>
    )
  }

  // Editing mode - use the command selector
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-secondary)]">
        {t('selector.instruction')} {selectedValues.length} {t('selector.selected')}.
      </p>

      <ValuesCommandSelector
        selectedValues={selectedValueOptions}
        onValuesChange={handleValueOptionsChange}
        placeholder={t('selector.placeholder', { defaultValue: 'Search for values...' })}
        noResultsText={t('selector.noResults', { defaultValue: 'No values found' })}
      />
    </div>
  )
}
