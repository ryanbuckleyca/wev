"use client"

import { ReactNode, useMemo, useState } from 'react'
import Tooltip from './Tooltip'
import ProgressDonut from './ProgressDonut'
import { ScrollablePills, ScrollablePillsItem } from '@/components/ui/ScrollablePills'
import { getValueDefinition } from '@/lib/values'
import { useTranslations } from 'next-intl'
import { LocationArrowRightOutlined } from '@lineiconshq/free-icons'

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
  workType?: 'remote' | 'hybrid' | 'office'
  selectedWorkTypes?: string[]
}

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
  workType,
  selectedWorkTypes = [],
}: JobCardFooterProps) {
  const t = useTranslations()
  const [valuesExpanded, setValuesExpanded] = useState(false)
  const [skillsExpanded, setSkillsExpanded] = useState(false)


  const formatValueLabel = (value: string) => {
    const fallbackLabel = value
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, char => char.toUpperCase())
    return t(`values.${value}.name`, { defaultValue: fallbackLabel })
  }

  const formatSkillLabel = (skill: string) => {
    if (skillTerms[skill]) return skillTerms[skill]
    try {
      const parsed = new URL(skill)
      const slug = decodeURIComponent(parsed.pathname.split('/').pop() || skill)
      return slug.replace(/[-_]/g, ' ')
    } catch {
      return skill
    }
  }

  // Calculate match counts for summary pills
  const matchedValueCount = sharedValues.length
  const totalValueCount = values.length
  const matchedSkillCount = sharedSkills.filter(skill => skills.includes(skill)).length
  const totalSkillCount = skills.length

  const buildSummaryPill = (
    matchedCount: number,
    totalCount: number,
    matchedNames: string,
    unmatchedNames: string,
    label: string,
    icon: 'heart' | 'briefcase'
  ): ScrollablePillsItem | null => {
    if (totalCount === 0) return null

    let tooltip = `${matchedCount} of ${totalCount} ${label} match your profile`
    if (matchedNames) {
      tooltip += `<br/><br/><strong>Matched:</strong> ${matchedNames}`
    }
    if (unmatchedNames) {
      tooltip += `<br/><br /><strong>Unmatched:</strong> ${unmatchedNames}`
    }
    tooltip += `<br/><br/><em>Click to expand details</em>`

    return {
      label: `${matchedCount}/${totalCount} ${label}`,
      tooltip,
      isMatched: matchedCount > 0,
      icon,
      type: 'summary',
    }
  }

  const buildWorkTypePill = (): ScrollablePillsItem | undefined => {
    if (!workType) return undefined

    const isMatched = selectedWorkTypes.includes(workType)
    const label = workType.charAt(0).toUpperCase() + workType.slice(1)
    const tooltip = isMatched
      ? `${label} matches your current work-style filter.`
      : `${label} is provided by this employer. Active filters take priority over saved preferences.`

    return {
      label,
      tooltip,
      isMatched,
      icon: 'location' as const,
      type: 'workType' as const,
    }
  }

  // Create summary pills
  const summaryItems = useMemo(() => {
    const matchedValueNames = sharedValues.map(formatValueLabel).join(', ')
    const unmatchedValueNames = values
      .filter(value => !sharedValues.includes(value))
      .map(formatValueLabel)
      .join(', ')

    const matchedSkillNames = sharedSkills
      .filter(skill => skills.includes(skill))
      .map(skill => formatSkillLabel(skill).toLowerCase())
      .join(', ')
    const unmatchedSkillNames = skills
      .filter(skill => !sharedSkills.includes(skill))
      .map(skill => formatSkillLabel(skill).toLowerCase())
      .join(', ')

    return [
      buildSummaryPill(
        matchedValueCount,
        totalValueCount,
        matchedValueNames,
        unmatchedValueNames,
        'values',
        'heart'
      ),
      buildSummaryPill(
        matchedSkillCount,
        totalSkillCount,
        matchedSkillNames,
        unmatchedSkillNames,
        'skills',
        'briefcase'
      ),
    ].filter(Boolean) as ScrollablePillsItem[]
  }, [
    matchedValueCount,
    totalValueCount,
    matchedSkillCount,
    totalSkillCount,
    sharedValues,
    sharedSkills,
    values,
    skills,
    skillTerms,
  ])

  // Create separate arrays for values and skills
  const valueItems = useMemo(() => {
    const matchedValues = values
      .filter(value => sharedValues.includes(value))
      .map(value => {
        const valueName = formatValueLabel(value)
        const fallbackDef = getValueDefinition(value)
        const translatedDescription = t(`values.${value}.description`, { defaultValue: fallbackDef.description })
        const translatedExample = t(`values.${value}.example`, { defaultValue: fallbackDef.example || '' })
        const translatedDef = getValueDefinition(value, {
          name: valueName,
          description: translatedDescription,
          example: translatedExample,
        })
        return {
          label: valueName,
          tooltip: `${translatedDef.description}<br/><br/><em>${translatedDef.example}</em><br/><br/><em>Click to collapse to summary</em>`,
          isMatched: true,
          type: 'value' as const,
        }
      })

    const unmatchedValues = values
      .filter(value => !sharedValues.includes(value))
      .map(value => {
        const valueName = formatValueLabel(value)
        const fallbackDef = getValueDefinition(value)
        const translatedDescription = t(`values.${value}.description`, { defaultValue: fallbackDef.description })
        const translatedExample = t(`values.${value}.example`, { defaultValue: fallbackDef.example || '' })
        const translatedDef = getValueDefinition(value, {
          name: valueName,
          description: translatedDescription,
          example: translatedExample,
        })
        return {
          label: valueName,
          tooltip: `${translatedDef.description}<br/><br/><em>${translatedDef.example}</em><br/><br/><em>Click to collapse to summary</em>`,
          isMatched: false,
          type: 'value' as const,
        }
      })

    // Combine matched and unmatched values
    return [...matchedValues, ...unmatchedValues]
  }, [values, sharedValues, t])

  const skillItems = useMemo(() => {
    const matchedSkills = skills
      .filter(skill => sharedSkills.includes(skill))
      .map(skill => {
        const skillLabel = formatSkillLabel(skill).toLowerCase()
        const skillTooltip = skillDefinitions[skill]
        return {
          label: skillLabel,
          tooltip: `${skillTooltip || ''}<br/><br/><em>Click to collapse to summary</em>`,
          isMatched: true,
          type: 'skill' as const,
        }
      })

    const unmatchedSkills = skills
      .filter(skill => !sharedSkills.includes(skill))
      .map(skill => {
        const skillLabel = formatSkillLabel(skill).toLowerCase()
        const skillTooltip = skillDefinitions[skill]
        return {
          label: skillLabel,
          tooltip: `${skillTooltip || ''}<br/><br/><em>Click to collapse to summary</em>`,
          isMatched: false,
          type: 'skill' as const,
        }
      })

    // Combine matched and unmatched skills
    return [...matchedSkills, ...unmatchedSkills]
  }, [skills, sharedSkills, skillTerms, skillDefinitions])

  const valueSummaryPill = summaryItems.find(item => item.icon === 'heart')
  const skillSummaryPill = summaryItems.find(item => item.icon === 'briefcase')

  const buildCluster = (
    summary: ScrollablePillsItem | undefined,
    items: ScrollablePillsItem[],
    expanded: boolean
  ): ScrollablePillsItem[] => {
    if (!summary) return expanded ? items : []
    if (!expanded) {
      return [{ ...summary, groupId: undefined, className: 'transition-colors border border-border rounded-full' }]
    }

    const clusterId = summary.icon ? `cluster-${summary.icon}` : undefined
    const connectedItems = items.map((item, index, arr) => {
      const isLast = index === arr.length - 1
      return {
        ...item,
        groupId: clusterId,
        className: `rounded-none border border-border -ml-px border-l border-border ${isLast ? 'rounded-r-full' : ''}`,
      }
    })

    return [
      {
        ...summary,
        groupId: clusterId,
        className: 'rounded-r-none pr-3 shadow-sm border border-border',
      },
      ...connectedItems,
    ]
  }

  const workTypePill = workType ? buildWorkTypePill() : undefined
  const inlineItems: ScrollablePillsItem[] = [
    ...(workTypePill ? [workTypePill] : []),
    ...buildCluster(valueSummaryPill, valueItems, valuesExpanded && totalValueCount > 0),
    ...buildCluster(skillSummaryPill, skillItems, skillsExpanded && totalSkillCount > 0),
  ]

  const handlePillClick = (item: ScrollablePillsItem) => {
    if (item.type === 'summary') {
      if (item.icon === 'heart') {
        setValuesExpanded(prev => !prev)
      } else if (item.icon === 'briefcase') {
        setSkillsExpanded(prev => !prev)
      }
    } else if (item.type === 'value') {
      setValuesExpanded(false)
    } else if (item.type === 'skill') {
      setSkillsExpanded(false)
    }
  }

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
        {inlineItems.length > 0 && (
          <ScrollablePills
            items={inlineItems}
            variant="default"
            fadeBackground={fadeBackground}
            onItemClick={handlePillClick}
          />
        )}
      </div>
    </div>
  )
}
