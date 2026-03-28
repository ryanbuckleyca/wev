import { forwardRef, useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import SkillItem from './SkillItem'
import type { EscoSkill } from '../SkillsSelector'

interface SkillsListProps {
  skills: (EscoSkill & { label: string; internalMatchedAlias?: string | null })[]
  selectedUris: Set<string>
  onToggle: (skill: EscoSkill) => void
  locale: 'en' | 'fr'
  isSearching: boolean
  hasQuery: boolean
  /** DOM id for listbox (link from search field with aria-controls). */
  listboxId: string
  /** Optional id of sr-only keyboard hint (aria-describedby). */
  ariaDescribedBy?: string
}

const SkillsList = forwardRef<HTMLDivElement, SkillsListProps>(function SkillsList(
  {
    skills,
    selectedUris,
    onToggle,
    locale,
    isSearching,
    hasQuery,
    listboxId,
    ariaDescribedBy,
  },
  ref,
) {
  const t = useTranslations('profile')
  const [activeIndex, setActiveIndex] = useState(0)

  const skillKey = skills.map((s) => s.uri).join('\0')

  useEffect(() => {
    setActiveIndex(0)
  }, [skillKey])

  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= skills.length) return
    const el = document.getElementById(`${listboxId}-opt-${activeIndex}`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, listboxId, skills.length])

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (skills.length === 0) return
      const last = skills.length - 1
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((i) => Math.min(i + 1, last))
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((i) => Math.max(i - 1, 0))
          break
        case 'Home':
          e.preventDefault()
          setActiveIndex(0)
          break
        case 'End':
          e.preventDefault()
          setActiveIndex(last)
          break
        case ' ':
        case 'Spacebar':
          e.preventDefault()
          onToggle(skills[activeIndex])
          break
        case 'Enter':
          e.preventDefault()
          onToggle(skills[activeIndex])
          break
        default:
          break
      }
    },
    [activeIndex, onToggle, skills],
  )

  if (!hasQuery) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        {t('skillsEmptyState')}
      </div>
    )
  }

  if (skills.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-400">
        {isSearching ? t('skillsLoading') : t('skillsNoResults')}
      </div>
    )
  }

  const activeDescendantId =
    activeIndex >= 0 && activeIndex < skills.length
      ? `${listboxId}-opt-${activeIndex}`
      : undefined

  return (
    <div
      ref={ref}
      id={listboxId}
      role="listbox"
      tabIndex={0}
      aria-label={t('skillsListboxLabel')}
      aria-describedby={ariaDescribedBy}
      aria-multiselectable="true"
      aria-activedescendant={activeDescendantId}
      onKeyDown={handleListKeyDown}
      className="overflow-x-hidden pb-4 outline-none focus-visible:ring-2 focus-visible:ring-gray-200 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-600 dark:focus-visible:ring-offset-zinc-950 rounded-md"
    >
      {skills.map((skill, index) => (
        <SkillItem
          key={skill.uri}
          id={`${listboxId}-opt-${index}`}
          isActive={index === activeIndex}
          skill={skill}
          isSelected={selectedUris.has(skill.uri)}
          onToggle={() => onToggle(skill)}
          onActivate={() => setActiveIndex(index)}
          locale={locale}
        />
      ))}
    </div>
  )
})

export default SkillsList
