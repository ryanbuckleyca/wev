import { useTranslations } from 'next-intl'
import SkillItem from './SkillItem'
import { useListbox } from '../useListbox'
import type { EscoSkill } from './SkillsSelector'

interface SkillsListProps {
  skills: (EscoSkill & { label: string; internalMatchedAlias?: string | null })[]
  selectedUris: Set<string>
  onToggle: (skill: EscoSkill) => void
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
    <div
      id={listboxId}
      role="listbox"
      tabIndex={0}
      aria-label={t('skillsListboxLabel')}
      aria-activedescendant={activeDescendant}
      aria-describedby={ariaDescribedBy}
      onKeyDown={(e) => handleKeyDown(e, (i) => onToggle(skills[i]))}
      className="overflow-x-hidden pb-4 rounded-md focus:outline-none"
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
  )
}
