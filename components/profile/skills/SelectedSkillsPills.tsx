'use client'

import { useTranslations } from 'next-intl'
import InfoPopover from '@/components/InfoPopover'
import Pill from '@/components/Pill'
import ModalSelectedStrip from '../ModalSelectedStrip'
import { useListbox } from '../useListbox'
import type { EscoSkill } from './SkillsSelector'

const OPT_PREFIX = 'skills-pill'

interface SelectedSkillsPillsProps {
  skills: EscoSkill[]
  onRemove: (uri: string) => void
  locale: 'en' | 'fr'
  useHorizontalScroll?: boolean
  fadeBackground?: string
  regionHintId: string
}

export default function SelectedSkillsPills({
  skills,
  onRemove,
  locale,
  useHorizontalScroll = false,
  fadeBackground = 'var(--card)',
  regionHintId,
}: SelectedSkillsPillsProps) {
  const tPill = useTranslations('ariaLabels.pill')
  const tProfile = useTranslations('profile')
  const { activeIndex, activeDescendant, handleKeyDown } = useListbox(skills.length, OPT_PREFIX, true)

  if (skills.length === 0) return null

  return (
    <ModalSelectedStrip
      regionHintId={regionHintId}
      ariaLabel={tProfile('skillsSelectedRegionLabel', { count: skills.length })}
      useHorizontalScroll={useHorizontalScroll}
      fadeBackground={fadeBackground}
      listboxProps={{
        role: 'listbox',
        tabIndex: 0,
        'aria-activedescendant': activeDescendant,
        'aria-orientation': 'horizontal',
      }}
      onSectionKeyDown={(e) => handleKeyDown(e, (i) => onRemove(skills[i].uri), (i) => onRemove(skills[i].uri))}
    >
      {skills.map((skill, i) => (
        <div
          key={skill.uri}
          id={`${OPT_PREFIX}-${i}`}
          role="option"
          aria-selected
          className={`shrink-0 inline-flex rounded-full ${i === activeIndex ? 'ring-2 ring-blue-400/60' : ''}`}
        >
          <InfoPopover
            content={skill.description?.[locale] || skill.preferredLabel[locale]}
            className={useHorizontalScroll ? 'shrink-0' : undefined}
            triggerTabIndex={-1}
          >
            <Pill
              size="sm"
              onRemove={() => onRemove(skill.uri)}
              removeAriaLabel={tPill('remove', { label: skill.preferredLabel[locale] })}
              removeTabIndex={-1}
              className="md:py-1"
            >
              {skill.preferredLabel[locale]}
            </Pill>
          </InfoPopover>
        </div>
      ))}
    </ModalSelectedStrip>
  )
}
