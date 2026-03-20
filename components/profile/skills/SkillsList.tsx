import { Command } from 'cmdk'
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
}

export default function SkillsList({
  skills,
  selectedUris,
  onToggle,
  locale,
  isSearching,
  hasQuery,
}: SkillsListProps) {
  const t = useTranslations('profile')

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

  return (
    <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden scroll-smooth pb-4">
      {skills.map((skill) => (
        <SkillItem
          key={skill.uri}
          skill={skill}
          isSelected={selectedUris.has(skill.uri)}
          onToggle={() => onToggle(skill)}
          locale={locale}
        />
      ))}
    </Command.List>
  )
}
