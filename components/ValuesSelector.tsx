'use client'

import { VALUES_LIST } from '@/lib/values'

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
      onValuesChange(selectedValues.filter((v) => v !== value))
    } else {
      onValuesChange([...selectedValues, value])
    }
  }

  if (!isEditing) {
    // Display mode: show selected values as pills
    if (selectedValues.length === 0) {
      return <p className="text-[var(--text-tertiary)]">-</p>
    }

    return (
      <div className="flex flex-wrap gap-2">
        {selectedValues.map((value) => (
          <span
            key={value}
            className="inline-block bg-[var(--primary-tint)] text-[var(--primary-text)] px-3 py-1 rounded-full text-sm font-medium"
          >
            {value}
          </span>
        ))}
      </div>
    )
  }

  // Edit mode: show selectable grid
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {VALUES_LIST.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => toggleValue(value)}
          className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
            selectedValues.includes(value)
              ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
              : 'bg-[var(--bg)] text-[var(--text-primary)] border-[var(--border)] hover:border-[var(--primary)]'
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  )
}
