import { useTranslations } from 'next-intl'
import SkillItem from './SkillItem'
import { useListbox } from '../useListbox'
import type { SkillMatch } from './SkillsModal'

interface SkillsListProps {
  skills: SkillMatch[]
  selectedUris: Set<string>
  onToggle: (skill: SkillMatch) => void
  locale: 'en' | 'fr'
  hasQuery: boolean
  listboxId: string
  ariaDescribedBy?: string
}

export default function SkillsList({
  skills,
  selectedUris,
  onToggle,
  locale,
  hasQuery,
  listboxId,
  ariaDescribedBy,
}: SkillsListProps) {
  const t = useTranslations('profile')
  const optPrefix = `${listboxId}-opt`
  const { activeIndex, activeDescendant, setActive, handleKeyDown } = useListbox(skills.length, optPrefix)

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
        {t('skillsNoResults')}
      </div>
    )
  }

  return (
    <div className="group relative flex min-h-0 flex-1 flex-col rounded-md">
      <div
        id={listboxId}
        role="listbox"
        tabIndex={0}
        aria-label={t('skillsListboxLabel')}
        aria-activedescendant={activeDescendant}
        aria-describedby={ariaDescribedBy}
        onKeyDown={(e) => handleKeyDown(e, (i) => onToggle(skills[i]))}
        className="relative z-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md pb-2 focus:outline-none"
      >
        {skills.map((skill, i) => (
          <SkillItem
            key={skill.uri}
            id={`${optPrefix}-${i}`}
            skill={skill}
            isActive={i === activeIndex}
            isSelected={selectedUris.has(skill.uri)}
            onToggle={() => { setActive(i); onToggle(skill) }}
            locale={locale}
          />
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] rounded-md opacity-0 ring-2 ring-inset ring-blue-400/70 transition-opacity duration-150 group-focus-within:opacity-100"
      />
    </div>
  )
}
