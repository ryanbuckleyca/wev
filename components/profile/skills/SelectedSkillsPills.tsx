'use client'

import { useTranslations } from 'next-intl'
import InfoPopover from '@/components/InfoPopover'
import SelectedPillsStrip from '../SelectedPillsStrip'
import type { EscoSkill } from './SkillsSelector'

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
  const t = useTranslations('profile')

  const items = skills.map((s) => ({
    key: s.uri,
    label: s.preferredLabel[locale],
    removeArg: s.uri,
    _skill: s,
  }))

  return (
    <SelectedPillsStrip
      items={items}
      onRemove={onRemove}
      ariaLabel={t('skillsSelectedRegionLabel', { count: skills.length })}
      optPrefix="skills-pill"
      regionHintId={regionHintId}
      useHorizontalScroll={useHorizontalScroll}
      fadeBackground={fadeBackground}
      wrapPill={(pill, item) => (
        <InfoPopover
          content={(item as typeof items[number])._skill.description?.[locale] || item.label}
          className={useHorizontalScroll ? 'shrink-0' : undefined}
          triggerTabIndex={-1}
        >
          {pill}
        </InfoPopover>
      )}
    />
  )
}
