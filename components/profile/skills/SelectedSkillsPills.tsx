'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import HorizontalScrollWithFades from '@/components/ui/HorizontalScrollWithFades'
import InfoPopover from '@/components/InfoPopover'
import Pill from '@/components/Pill'
import ModalSelectedStrip, { type ModalStripApi } from '../ModalSelectedStrip'
import type { EscoSkill } from '../SkillsSelector'
import type { RefObject } from 'react'

interface SelectedSkillsPillsProps {
  skills: EscoSkill[]
  onRemove: (uri: string) => void
  locale: 'en' | 'fr'
  useHorizontalScroll?: boolean
  fadeBackground?: string
  /**
   * When set: the strip is one tab stop; Tab skips individual chips and moves
   * focus to `resultsListRef`. Enter enters remove-button roving; arrows move
   * between removes; Tab or Escape exits to the list (Escape returns to region).
   */
  resultsListRef?: RefObject<HTMLElement | null>
  /** Optional id of sr-only instructions (aria-describedby on the region). */
  regionHintId?: string
}

export default function SelectedSkillsPills({
  skills,
  onRemove,
  locale,
  useHorizontalScroll = false,
  fadeBackground = 'var(--card)',
  resultsListRef,
  regionHintId,
}: SelectedSkillsPillsProps) {
  const tPill = useTranslations('ariaLabels.pill')
  const tProfile = useTranslations('profile')
  const composite = Boolean(resultsListRef)
  const itemIds = useMemo(() => skills.map((s) => s.uri), [skills])

  if (skills.length === 0) return null

  const renderPills = (api: ModalStripApi | null) => {
    const comp = api !== null
    const roving = api?.rovingIndex ?? null
    const setRemoveRef = api?.setRemoveRef ?? (() => () => {})
    return skills.map((skill, index) => (
      <InfoPopover
        key={skill.uri}
        content={skill.description?.[locale] || skill.preferredLabel[locale]}
        className={useHorizontalScroll ? 'shrink-0' : undefined}
        triggerTabIndex={comp ? -1 : undefined}
      >
        <Pill
          size="sm"
          onRemove={() => onRemove(skill.uri)}
          removeAriaLabel={tPill('remove', { label: skill.preferredLabel[locale] })}
          removeTabIndex={comp ? (roving === index ? 0 : -1) : undefined}
          removeRef={comp ? setRemoveRef(skill.uri) : undefined}
          className="md:py-1"
        >
          {skill.preferredLabel[locale]}
        </Pill>
      </InfoPopover>
    ))
  }

  if (!composite) {
    const pillElements = renderPills(null)
    if (useHorizontalScroll) {
      return (
        <div className="shrink-0 border-b border-gray-100 pb-2 dark:border-zinc-800">
          <HorizontalScrollWithFades
            className="items-center"
            fadeBackground={fadeBackground}
            chevronsTabbable
          >
            {pillElements}
          </HorizontalScrollWithFades>
        </div>
      )
    }
    return (
      <div className="flex flex-wrap gap-2 pb-3 pt-1">{pillElements}</div>
    )
  }

  return (
    <ModalSelectedStrip
      itemIds={itemIds}
      resultsListRef={resultsListRef!}
      regionHintId={regionHintId}
      ariaLabel={tProfile('skillsSelectedRegionLabel', { count: skills.length })}
      useHorizontalScroll={useHorizontalScroll}
      fadeBackground={fadeBackground}
    >
      {(api) => renderPills(api)}
    </ModalSelectedStrip>
  )
}
