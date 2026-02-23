'use client'

import { VALUES_LIST } from '@/lib/values'
import Button from '@/components/Button'

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
        <Button
          key={value}
          onClick={() => toggleValue(value)}
          size="sm"
          fullWidth
          className="px-3 py-2"
          style={{
            background: selectedValues.includes(value) ? 'var(--primary)' : 'var(--bg)',
            color: selectedValues.includes(value) ? 'white' : 'var(--text-primary)',
            border: `2px solid ${selectedValues.includes(value) ? 'var(--primary)' : 'var(--border)'}`
          }}
        >
          {value}
        </Button>
      ))}
    </div>
  )
}
