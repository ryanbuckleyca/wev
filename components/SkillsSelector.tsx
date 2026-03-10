'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import CommandSelector, { type Option, dedupeOptions } from '@/components/CommandSelector'

export type SkillOption = Option & {
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
  softLimit?: number
  softLimitWarningText?: string
  locale?: 'en' | 'fr'
  matchedAliasLabel?: string
}

const DEBOUNCE_MS = 300
const MIN_CHARS = 2
const MAX_RESULTS = 20

function normalizeSkillText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
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
  maxSelections,
  maxSelectionsReachedText,
  softLimit,
  softLimitWarningText,
  locale = 'en',
  matchedAliasLabel = 'Matched',
}: SkillsSelectorProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [options, setOptions] = useState<SkillOption[]>([])
  const [loading, setLoading] = useState(false)
  const cacheRef = useRef<Map<string, SkillOption[]>>(new Map())

  // Debounce query
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [query])

  // Fetch skills based on debounced query
  useEffect(() => {
    if (debouncedQuery.length < MIN_CHARS) {
      setOptions([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const search = async () => {
      const cached = cacheRef.current.get(debouncedQuery)
      if (cached) {
        setOptions(cached)
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
          return
        }
        const body = (await res.json()) as {
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
        const nextOptions = dedupeOptions(
          (body.skills ?? []).map((skill) => {
            // Create rich tooltip content
            const tooltipContent = (
              <div className="space-y-2 text-left">
                <div>
                  <div className="font-semibold text-[var(--foreground)]">{skill.term}</div>
                  {skill.definition && (
                    <div className="text-[var(--foreground)] mt-1">{skill.definition}</div>
                  )}
                </div>
                {skill.scope_note && (
                  <div className="text-xs text-[var(--muted-foreground)]">
                    <span className="font-medium">Scope:</span> {skill.scope_note}
                  </div>
                )}
                {(skill.skill_type || skill.reuse_level) && (
                  <div className="flex gap-1 flex-wrap">
                    {skill.skill_type && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--muted-foreground)]">
                        {formatEnumLabel(skill.skill_type)}
                      </span>
                    )}
                    {skill.reuse_level && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--muted-foreground)]">
                        {formatEnumLabel(skill.reuse_level)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )

            return {
              value: skill.concept_uri,
              label: skill.term,
              tooltip: tooltipContent,
              definition: skill.definition,
              scopeNote: skill.scope_note,
              skillType: skill.skill_type,
              reuseLevel: skill.reuse_level,
              matchedAlias: skill.matched_alias,
            }
          })
        )
        cacheRef.current.set(debouncedQuery, nextOptions)
        setOptions(nextOptions)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setOptions([])
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

  const renderOptionContent = (option: SkillOption, isSelected: boolean) => (
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
        <div className="mt-1 flex flex-wrap gap-1">
          {formatEnumLabel(option.skillType) && (
            <span className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
              {formatEnumLabel(option.skillType)}
            </span>
          )}
          {formatEnumLabel(option.reuseLevel) && (
            <span className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
              {formatEnumLabel(option.reuseLevel)}
            </span>
          )}
        </div>
        {option.definition && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{option.definition}</p>}
        {option.scopeNote && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{option.scopeNote}</p>}
        {option.matchedAlias &&
          normalizeSkillText(option.matchedAlias) !== normalizeSkillText(option.label) && (
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
              {matchedAliasLabel}: {option.matchedAlias}
            </p>
          )}
      </div>
    </div>
  )

  return (
    <div className="space-y-2">
      <p className={`text-xs ${softLimit && selectedSkills.length > softLimit ? 'text-wev-warn-text' : 'text-muted-foreground'}`}>
        {softLimit ? `${selectedSkills.length} / ${softLimit} selected` : `${selectedSkills.length} selected`}
      </p>
      <CommandSelector
      selectedOptions={selectedSkills}
      onOptionsChange={onSkillsChange}
      placeholder={placeholder}
      noResultsText={noResultsText}
      loading={loading}
      loadingText={loadingText}
      minCharsText={minCharsText}
      minChars={MIN_CHARS}
      maxSelections={maxSelections}
      maxSelectionsReachedText={maxSelectionsReachedText}
      softLimit={softLimit}
      softLimitWarningText={softLimitWarningText}
      query={query}
      onQueryChange={setQuery}
      availableOptions={options}
      renderOptionContent={renderOptionContent}
    />
    </div>
  )
}
