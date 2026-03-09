'use client'

import { useRef, useState, useMemo, useEffect, ReactNode } from 'react'
import { Command } from 'cmdk'
import Pill from '@/components/Pill'
import Tooltip from '@/components/Tooltip'

export type Option = {
  value: string
  label: string
  tooltip?: string | ReactNode
  metadata?: ReactNode
}

type CommandSelectorProps<T extends Option> = {
  selectedOptions: T[]
  onOptionsChange: (options: T[]) => void
  placeholder: string
  noResultsText: string
  loading?: boolean
  loadingText?: string
  minCharsText?: string
  minChars?: number
  maxSelections?: number
  maxSelectionsReachedText?: string
  query: string
  onQueryChange: (query: string) => void
  availableOptions: T[]
  renderOptionContent?: (option: T, isSelected: boolean) => ReactNode
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function createDisplayKey(option: Pick<Option, 'label'> & { description?: string; definition?: string; scopeNote?: string }): string {
  const parts = [normalizeText(option.label)]
  if ('description' in option) parts.push(normalizeText(option.description))
  if ('definition' in option) parts.push(normalizeText(option.definition))
  if ('scopeNote' in option) parts.push(normalizeText(option.scopeNote))
  return parts.join('::')
}

export function dedupeOptions<T extends Option>(
  options: T[],
  displayKeyFn: (option: T) => string = createDisplayKey
): T[] {
  const seenValues = new Set<string>()
  const seenDisplays = new Set<string>()
  const deduped: T[] = []

  for (const option of options) {
    const key = displayKeyFn(option)
    if (seenValues.has(option.value) || seenDisplays.has(key)) {
      continue
    }
    seenValues.add(option.value)
    seenDisplays.add(key)
    deduped.push(option)
  }

  return deduped
}

export default function CommandSelector<T extends Option>({
  selectedOptions,
  onOptionsChange,
  placeholder,
  noResultsText,
  loading = false,
  loadingText,
  minCharsText,
  minChars = 0,
  maxSelections,
  maxSelectionsReachedText,
  query,
  onQueryChange,
  availableOptions,
  renderOptionContent,
}: CommandSelectorProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)

  const selectedSet = useMemo(
    () => new Set(selectedOptions.map((option) => option.value)),
    [selectedOptions]
  )
  const selectedDisplaySet = useMemo(
    () => new Set(selectedOptions.map((option) => createDisplayKey(option))),
    [selectedOptions]
  )

  const isAtSelectionLimit = maxSelections ? selectedOptions.length >= maxSelections : false
  const showMinCharsWarning = minChars > 0 && query.trim().length > 0 && query.trim().length < minChars

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

  // Open dropdown when options become available (only if there's a query)
  useEffect(() => {
    if (availableOptions.length > 0 && !loading && query.trim().length > 0) {
      setOpen(true)
    }
  }, [availableOptions.length, loading, query])

  const removeOption = (value: string) => {
    onOptionsChange(selectedOptions.filter((option) => option.value !== value))
  }

  const toggleOption = (option: T) => {
    const optionDisplayKey = createDisplayKey(option)
    if (selectedSet.has(option.value)) {
      onOptionsChange(selectedOptions.filter((opt) => opt.value !== option.value))
      setOpen(true)
      inputRef.current?.focus()
      return
    }

    if (selectedDisplaySet.has(optionDisplayKey)) {
      onOptionsChange(selectedOptions.filter((opt) => createDisplayKey(opt) !== optionDisplayKey))
      setOpen(true)
      inputRef.current?.focus()
      return
    }

    if (isAtSelectionLimit) {
      setOpen(true)
      inputRef.current?.focus()
      return
    }

    onOptionsChange([...selectedOptions, option])
    setOpen(true)
    inputRef.current?.focus()
  }

  const defaultRenderOption = (option: T, isSelected: boolean) => (
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
        <p className="font-medium text-[var(--text-primary)]">{option.label}</p>
        {option.metadata}
      </div>
    </div>
  )

  return (
    <div ref={containerRef} className="space-y-3">
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedOptions.map((option) => (
            <Tooltip key={option.value} content={option.tooltip || option.label}>
              <Pill removable onRemove={() => removeOption(option.value)}>
                {option.label}
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
            onValueChange={onQueryChange}
            onFocus={() => {
              if (availableOptions.length > 0 || loading) {
                setOpen(true)
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-lg bg-transparent px-4 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />

          {open && (
            <Command.List className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-lg">
              {!loading && availableOptions.length === 0 && (
                <Command.Empty className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {noResultsText}
                </Command.Empty>
              )}

              {loading && availableOptions.length === 0 && loadingText && (
                <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {loadingText}
                </div>
              )}

              {availableOptions.map((option) => {
                const optionDisplayKey = createDisplayKey(option)
                const isSelected =
                  selectedSet.has(option.value) || selectedDisplaySet.has(optionDisplayKey)
                const isDisabled = isAtSelectionLimit && !isSelected

                return (
                  <Command.Item
                    key={option.value}
                    value={`${option.label}`}
                    disabled={isDisabled}
                    onMouseDown={(e) => {
                      e.preventDefault()
                    }}
                    onSelect={() => toggleOption(option)}
                    className={`cursor-pointer px-4 py-3 text-left text-sm aria-selected:bg-[var(--primary-tint)] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 ${
                      isSelected ? 'bg-[var(--primary-tint)]' : ''
                    }`}
                  >
                    {renderOptionContent
                      ? renderOptionContent(option, isSelected)
                      : defaultRenderOption(option, isSelected)}
                  </Command.Item>
                )
              })}

              {loading && availableOptions.length > 0 && loadingText && (
                <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text-tertiary)]">
                  {loadingText}
                </div>
              )}
            </Command.List>
          )}
        </Command>
      </div>

      {showMinCharsWarning && minCharsText && (
        <p className="text-xs text-[var(--text-tertiary)]">{minCharsText}</p>
      )}

      {isAtSelectionLimit && maxSelectionsReachedText && (
        <p className="text-xs text-[var(--text-tertiary)]">{maxSelectionsReachedText}</p>
      )}
    </div>
  )
}
