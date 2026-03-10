"use client"

import { ReactNode, useMemo } from 'react'
import Tooltip from './Tooltip'
import ProgressDonut from './ProgressDonut'
import { ScrollablePills } from '@/components/ui/ScrollablePills'
import { getValueDefinition } from '@/lib/values'
import { useTranslations } from 'next-intl'

interface JobCardFooterProps {
  values: string[]
  skills: string[]
  sharedValues: string[]
  sharedSkills: string[]
  isValueMatched: (value: string) => boolean
  isSkillMatched: (skill: string) => boolean
  skillTerms: Record<string, string>
  skillDefinitions: Record<string, string>
  totalMatchPercentage: number
  matchTooltipContent: ReactNode | null
  showTooltip: boolean
  fadeBackground?: string
}

const MAX_ITEMS = 5

export default function JobCardFooter({
  values,
  skills,
  sharedValues,
  sharedSkills,
  isValueMatched,
  isSkillMatched,
  skillTerms,
  skillDefinitions,
  totalMatchPercentage,
  matchTooltipContent,
  showTooltip,
  fadeBackground = 'var(--muted)',
}: JobCardFooterProps) {
  const t = useTranslations()

  const valueItems = useMemo(() => {
    const ordered = [
      ...values.filter(value => sharedValues.includes(value)),
      ...values.filter(value => !sharedValues.includes(value)),
    ].slice(0, MAX_ITEMS)

    return ordered.map(value => {
      const valueName = t(`values.${value}.name`, { defaultValue: value }).toLowerCase()
      const valueDef = getValueDefinition(value, {
        name: valueName,
        description: t(`values.${value}.description`),
        example: t(`values.${value}.example`),
      })
      return {
        label: valueName,
        tooltip: `${valueDef.description}<br/><br/><em>Example: ${valueDef.example}</em>`,
        isMatched: isValueMatched(value),
        icon: 'heart' as const,
        type: 'value' as const,
      }
    })
  }, [values, sharedValues, isValueMatched, t])

  const skillItems = useMemo(() => {
    const ordered = [
      ...skills.filter(skill => sharedSkills.includes(skill)),
      ...skills.filter(skill => !sharedSkills.includes(skill)),
    ]
      .filter(skill => skillTerms[skill]) // Only show skills with terms
      .slice(0, MAX_ITEMS)

    return ordered.map(skill => {
      const skillLabel = skillTerms[skill].toLowerCase()
      const skillTooltip = skillDefinitions[skill]
      return {
        label: skillLabel,
        tooltip: skillTooltip,
        isMatched: isSkillMatched(skill),
        icon: 'briefcase' as const,
        type: 'skill' as const,
      }
    })
  }, [skills, sharedSkills, skillTerms, skillDefinitions, isSkillMatched])

  return (
    <div className="flex gap-4">
      {showTooltip && matchTooltipContent && (
        <div className="flex items-center justify-center pr-4 border-r border-border">
          <Tooltip content={matchTooltipContent}>
            <div className="flex items-center gap-2 cursor-pointer">
              <ProgressDonut percentage={totalMatchPercentage} size="sm" text="" />
              <span className="text-sm font-medium text-foreground">{totalMatchPercentage}%</span>
            </div>
          </Tooltip>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <ScrollablePills
          items={[...valueItems, ...skillItems]}
          variant="default"
          fadeBackground={fadeBackground}
        />
      </div>
    </div>
  )
}
