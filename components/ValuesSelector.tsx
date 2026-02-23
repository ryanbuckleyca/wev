'use client'

import { VALUES_LIST } from '@/lib/values'
import Pill from '@/components/Pill'
import PillSelector from '@/components/PillSelector'

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

  if (!isEditing) {
    // Display mode: show selected values as pills
    if (selectedValues.length === 0) {
      return <p className="text-[var(--text-tertiary)]">-</p>
    }

    return (
      <div className="flex flex-wrap gap-2">
        {selectedValues.map((value) => (
          <Pill key={value}>{value}</Pill>
        ))}
      </div>
    )
  }

  // Edit mode: show selectable grid
  return (
    <PillSelector
      options={VALUES_LIST}
      selectedOptions={selectedValues}
      onSelectionChange={onValuesChange}
      multiSelect={true}
      columns={2}
    />
  )
}
