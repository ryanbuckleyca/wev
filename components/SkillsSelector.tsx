'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Command } from 'cmdk'
import Pill from '@/components/Pill'
import Tooltip from '@/components/Tooltip'

export type SkillOption = {
  value: string
  label: string
  definition: string | null
  scopeNote: string | null
  skillType: string | null
  reuseLevel: string | null
  matchedAlias?: string | null
}

type SkillsSelectorProps = {
  selectedSkills: SkillOption[]
  onSkillsChange: (skills: SkillOption[]) => void
  placeholder: string
  minCharsText: string
  noResultsText: string
  loadingText: string
  maxSelections?: number
  maxSelectionsReachedText?: string
  locale?: 'en' | 'fr'
  matchedAliasLabel?: string
}

const DEBOUNCE_MS = 300
const MIN_CHARS = 2
const MAX_RESULTS = 20

function normalizeSkillText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function displayKey(skill: Pick<SkillOption, 'label' | 'definition' | 'scopeNote'>): string {
  return `${normalizeSkillText(skill.label)}::${normalizeSkillText(skill.definition)}::${normalizeSkillText(skill.scopeNote)}`
}

function dedupeOptions(options: SkillOption[]): SkillOption[] {
  const seenValues = new Set<string>()
  const seenDisplays = new Set<string>()
  const deduped: SkillOption[] = []

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

function formatEnumLabel(value: string | null | undefined): string {
  const clean = _cleanDisplay(value)
  if (!clean) {
    return ''
  }
  return clean
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function _cleanDisplay(value: string | null | undefined): string {
  return (value ?? '').trim()
}

export default function SkillsSelector({
  selectedSkills,
  onSkillsChange,
  placeholder,
  minCharsText,
  noResultsText,
  loadingText,
  maxSelections = 10,
  maxSelectionsReachedText,
  locale = 'en',
  matchedAliasLabel = 'Matched',
}: SkillsSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [options, setOptions] = useState<SkillOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const cacheRef = useRef<Map<string, SkillOption[]>>(new Map())

  const selectedSet = useMemo(
    () => new Set(selectedSkills.map((skill) => skill.value)),
    [selectedSkills]
  )
  const selectedDisplaySet = useMemo(
    () => new Set(selectedSkills.map((skill) => displayKey(skill))),
    [selectedSkills]
  )
  const isAtSelectionLimit = selectedSkills.length >= maxSelections

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [query])

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    if (debouncedQuery.length < MIN_CHARS) {
      setOptions([])
      setOpen(false)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const search = async () => {
      const cached = cacheRef.current.get(debouncedQuery)
      if (cached) {
        setOptions(cached)
        setOpen(true)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          limit: String(MAX_RESULTS),
          locale,
        })
        const res = await fetch(`/api/skills/search?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          setOptions([])
          setOpen(true)
          return
        }
        const body = await res.json() as {
          skills?: Array<{
            concept_uri: string
            term: string
            definition: string | null
            scope_note: string | null
            skill_type: string | null
            reuse_level: string | null
            matched_alias: string | null
          }>
        }
        const nextOptions = dedupeOptions((body.skills ?? [])
          .map((skill) => ({
            value: skill.concept_uri,
            label: skill.term,
            definition: skill.definition,
            scopeNote: skill.scope_note,
            skillType: skill.skill_type,
            reuseLevel: skill.reuse_level,
            matchedAlias: skill.matched_alias,
          })))
        cacheRef.current.set(debouncedQuery, nextOptions)
        setOptions(nextOptions)
        setOpen(true)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setOptions([])
          setOpen(true)
        }
      } finally {
        setLoading(false)
      }
    }

    void search()
    return () => {
      controller.abort()
    }
  }, [debouncedQuery, locale])

  const removeSkill = (value: string) => {
    onSkillsChange(selectedSkills.filter((skill) => skill.value !== value))
  }

  const toggleSkill = (option: SkillOption) => {
    const optionDisplayKey = displayKey(option)
    if (selectedSet.has(option.value)) {
      onSkillsChange(selectedSkills.filter((skill) => skill.value !== option.value))
      setOpen(true)
      inputRef.current?.focus()
      return
    }

    if (selectedDisplaySet.has(optionDisplayKey)) {
      onSkillsChange(selectedSkills.filter((skill) => displayKey(skill) !== optionDisplayKey))
      setOpen(true)
      inputRef.current?.focus()
      return
    }

    if (isAtSelectionLimit) {
      setOpen(true)
      inputRef.current?.focus()
      return
    }

    onSkillsChange([...selectedSkills, option])
    setOpen(true)
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="space-y-3">
      {selectedSkills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedSkills.map((skill) => (
            <Tooltip key={skill.value} content={skill.definition || `<em>${skill.label}</em>`}>
              <Pill
                removable
                onRemove={() => removeSkill(skill.value)}
              >
                {skill.label}
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
              if (options.length > 0 || loading) {
                setOpen(true)
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-lg bg-transparent px-4 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />

          {open && (
            <Command.List className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-lg">
              {!loading && options.length === 0 && (
                <Command.Empty className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {noResultsText}
                </Command.Empty>
              )}

              {loading && options.length === 0 && (
                <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {loadingText}
                </div>
              )}

              {options.map((option) => {
                const optionDisplayKey = displayKey(option)
                const isSelected =
                  selectedSet.has(option.value) || selectedDisplaySet.has(optionDisplayKey)
                const isDisabled = isAtSelectionLimit && !isSelected

                return (
                  <Command.Item
                    key={option.value}
                    value={`${option.label} ${option.definition ?? ''}`}
                    disabled={isDisabled}
                    onMouseDown={(e) => {
                      // Prevent input blur/focus churn while selecting.
                      e.preventDefault()
                    }}
                    onSelect={() => toggleSkill(option)}
                    className={`cursor-pointer px-4 py-3 text-left text-sm aria-selected:bg-[var(--primary-tint)] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 ${
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
                        <div className="mt-1 flex flex-wrap gap-1">
                          {formatEnumLabel(option.skillType) && (
                            <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                              {formatEnumLabel(option.skillType)}
                            </span>
                          )}
                          {formatEnumLabel(option.reuseLevel) && (
                            <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                              {formatEnumLabel(option.reuseLevel)}
                            </span>
                          )}
                        </div>
                        {option.definition && (
                          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                            {option.definition}
                          </p>
                        )}
                        {option.scopeNote && (
                          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                            {option.scopeNote}
                          </p>
                        )}
                        {option.matchedAlias && normalizeSkillText(option.matchedAlias) !== normalizeSkillText(option.label) && (
                          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                            {matchedAliasLabel}: {option.matchedAlias}
                          </p>
                        )}
                      </div>
                    </div>
                  </Command.Item>
                )
              })}

              {loading && options.length > 0 && (
                <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text-tertiary)]">
                  {loadingText}
                </div>
              )}
            </Command.List>
          )}
        </Command>
      </div>

      {query.trim().length > 0 && query.trim().length < MIN_CHARS && (
        <p className="text-xs text-[var(--text-tertiary)]">{minCharsText}</p>
      )}

      {isAtSelectionLimit && maxSelectionsReachedText && (
        <p className="text-xs text-[var(--text-tertiary)]">{maxSelectionsReachedText}</p>
      )}
    </div>
  )
}
