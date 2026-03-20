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
        className="md:py-1 px-3"
      >
        {skill.preferredLabel[locale]}
      </Pill>
    </InfoPopover>
  ))

  if (useHorizontalScroll) {
    return (
      <HorizontalScrollWithFades 
        containerClassName="shrink-0 border-b border-gray-100 dark:border-zinc-800 pb-1 pt-2"
        className="px-4 pb-3 pt-1"
        fadeBackground={fadeBackground}
      >
        {pillElements}
      </HorizontalScrollWithFades>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 pb-3 pt-1">
      {pillElements}
    </div>
  )
}
