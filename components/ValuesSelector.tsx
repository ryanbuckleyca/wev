'use client'

import { VALUES_LIST, getValueDefinition } from '@/lib/values'
import Pill from '@/components/Pill'

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
  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onValuesChange(selectedValues.filter((selected) => selected !== value))
      return
    }

    onValuesChange([...selectedValues, value])
  }

  if (!isEditing) {
    if (selectedValues.length === 0) {
      return <p className="text-[var(--text-tertiary)]">-</p>
    }

    return (
      <div className="space-y-3">
        {selectedValues.map((value) => (
          <div
            key={value}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              <Pill>{value}</Pill>
            </div>
            <p className="text-sm text-[var(--text-primary)]">
              {getValueDefinition(value).description}
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {getValueDefinition(value).example}
            </p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-secondary)]">
        Select the values that matter most to you. {selectedValues.length} selected.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {VALUES_LIST.map((value) => {
          const details = getValueDefinition(value)
          const isSelected = selectedValues.includes(value)

          return (
            <button
              key={value}
              type="button"
              onClick={() => toggleValue(value)}
              aria-pressed={isSelected}
              className="rounded-lg border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              style={{
                borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                background: isSelected ? 'var(--primary-tint)' : 'var(--surface)',
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {value}
                </span>
                {isSelected && (
                  <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-xs font-medium text-white">
                    Selected
                  </span>
                )}
              </div>

              <p className="text-xs text-[var(--text-primary)]">
                {details.description}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {details.example}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
