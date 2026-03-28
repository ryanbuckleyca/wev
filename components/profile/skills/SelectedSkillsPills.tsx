import { useTranslations } from 'next-intl'
import HorizontalScrollWithFades from '@/components/ui/HorizontalScrollWithFades'
import InfoPopover from '@/components/InfoPopover'
import Pill from '@/components/Pill'
import type { EscoSkill } from '../SkillsSelector'

interface SelectedSkillsPillsProps {
  skills: EscoSkill[]
  onRemove: (uri: string) => void
  locale: 'en' | 'fr'
  useHorizontalScroll?: boolean
  fadeBackground?: string
}

export default function SelectedSkillsPills({
  skills,
  onRemove,
  locale,
  useHorizontalScroll = false,
  fadeBackground = 'var(--card)',
}: SelectedSkillsPillsProps) {
  const t = useTranslations('ariaLabels.pill')
  if (skills.length === 0) return null

  const pillElements = skills.map((skill) => (
    <InfoPopover 
      key={skill.uri} 
      content={skill.description?.[locale] || skill.preferredLabel[locale]}
      className={useHorizontalScroll ? 'shrink-0' : undefined}
    >
      <Pill
        size="sm"
        onRemove={() => onRemove(skill.uri)}
        removeAriaLabel={t('remove', { label: skill.preferredLabel[locale] })}
        className="md:py-1"
      >
        {skill.preferredLabel[locale]}
      </Pill>
    </InfoPopover>
  ))

  if (useHorizontalScroll) {
    return (
      <div className="shrink-0 border-b border-gray-100 pb-2 dark:border-zinc-800">
        <HorizontalScrollWithFades className="items-center" fadeBackground={fadeBackground}>
          {pillElements}
        </HorizontalScrollWithFades>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 pb-3 pt-1">
      {pillElements}
    </div>
  )
}

