'use client'

import { useMemo, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { useTranslations } from 'next-intl'
import { VALUES_LIST, getValueDefinition } from '@/lib/values'
import Pill from '@/components/Pill'
import Tooltip from '@/components/Tooltip'

export type ValueOption = {
  value: string
  label: string
  description: string
  example: string
}

type ValuesCommandSelectorProps = {
  selectedValues: ValueOption[]
  onValuesChange: (values: ValueOption[]) => void
  placeholder: string
  noResultsText: string
}

function normalizeValueText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function displayKey(value: Pick<ValueOption, 'label' | 'description'>): string {
  return `${normalizeValueText(value.label)}::${normalizeValueText(value.description)}`
}

function dedupeOptions(options: ValueOption[]): ValueOption[] {
  const seenValues = new Set<string>()
  const seenDisplays = new Set<string>()
  const deduped: ValueOption[] = []

  for (const option of options) {
    const key = displayKey(option)
    if (seenValues.has(option.value) || seenDisplays.has(key)) {
      continue
    }
    seenValues.add(option.value)
    seenDisplays.add(key)
    deduped.push(option)
  }

  return deduped
}

export default function ValuesCommandSelector({
  selectedValues,
  onValuesChange,
  placeholder,
  noResultsText,
}: ValuesCommandSelectorProps) {
  const t = useTranslations('values')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  // Convert VALUES_LIST to ValueOption format with translations
  const allValueOptions: ValueOption[] = useMemo(() => {
    return VALUES_LIST.map((value) => {
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

  const selectedSet = useMemo(
    () => new Set(selectedValues.map((value) => value.value)),
    [selectedValues]
  )
  const selectedDisplaySet = useMemo(
    () => new Set(selectedValues.map((value) => displayKey(value))),
    [selectedValues]
  )

  // Handle click outside to close
  useState(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current) {
        return
      }
      const target = event.target
      if (target instanceof Node && !containerRef.current.contains(target)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  })

  const removeValue = (value: string) => {
    onValuesChange(selectedValues.filter((val) => val.value !== value))
  }

  const toggleValue = (option: ValueOption) => {
    const optionDisplayKey = displayKey(option)
    if (selectedSet.has(option.value)) {
      onValuesChange(selectedValues.filter((val) => val.value !== option.value))
      setOpen(true)
      inputRef.current?.focus()
      return
    }

    if (selectedDisplaySet.has(optionDisplayKey)) {
      onValuesChange(selectedValues.filter((val) => displayKey(val) !== optionDisplayKey))
      setOpen(true)
      inputRef.current?.focus()
      return
    }

    onValuesChange([...selectedValues, option])
    setOpen(true)
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="space-y-3">
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedValues.map((value) => (
            <Tooltip key={value.value} content={value.description}>
              <Pill
                removable
                onRemove={() => removeValue(value.value)}
              >
                {value.label}
              </Pill>
            </Tooltip>
          ))}
        </div>
      )}

      <div className="relative">
        <Command
          shouldFilter={false}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)]"
        >
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            onFocus={() => {
              if (dedupedOptions.length > 0) {
                setOpen(true)
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-lg bg-transparent px-4 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />

          {open && (
            <Command.List className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-lg">
              {dedupedOptions.length === 0 && (
                <Command.Empty className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {noResultsText}
                </Command.Empty>
              )}

              {dedupedOptions.map((option) => {
                const optionDisplayKey = displayKey(option)
                const isSelected =
                  selectedSet.has(option.value) || selectedDisplaySet.has(optionDisplayKey)

                return (
                  <Command.Item
                    key={option.value}
                    value={`${option.label} ${option.description} ${option.example}`}
                    onMouseDown={(e) => {
                      // Prevent input blur/focus churn while selecting.
                      e.preventDefault()
                    }}
                    onSelect={() => toggleValue(option)}
                    className={`cursor-pointer px-4 py-3 text-left text-sm aria-selected:bg-[var(--primary-tint)] ${
                      isSelected ? 'bg-[var(--primary-tint)]' : ''
                    }`}
                  >
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
                        <p className="font-medium text-[var(--text-primary)]">
                          {option.label}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {option.description}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                          {option.example}
                        </p>
                      </div>
                    </div>
                  </Command.Item>
                )
              })}
            </Command.List>
          )}
        </Command>
      </div>
    </div>
  )
}
