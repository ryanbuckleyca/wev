'use client'

import { useMemo, useState, useEffect } from 'react'
import { ScrollablePills, ScrollablePillsItem } from '@/components/ui/ScrollablePills'

export interface ExpandablePillGroup {
  key: string
  summary?: ScrollablePillsItem
  items: ScrollablePillsItem[]
}

interface ExpandablePillsProps {
  preItems?: ScrollablePillsItem[]
  groups: ExpandablePillGroup[]
  variant?: 'default' | 'pink' | 'gray'
  fadeBackground?: string
}

export default function ExpandablePills({
  preItems = [],
  groups,
  variant = 'default',
  fadeBackground = 'var(--card)',
}: ExpandablePillsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  const normalizedGroups = useMemo(
    () => groups.filter(group => group.summary || group.items.length > 0),
    [groups]
  )

  const groupByKey = useMemo(
    () => Object.fromEntries(normalizedGroups.map(group => [group.key, group])),
    [normalizedGroups]
  )

  const buildCluster = (group: ExpandablePillGroup): ScrollablePillsItem[] => {
    if (!group.summary) {
      return group.items.map(item => ({
        ...item,
        groupKey: group.key,
      }))
    }

    const isExpanded = Boolean(expandedGroups[group.key]) && group.items.length > 0
    if (!isExpanded) {
      return [
        {
          ...group.summary,
          groupKey: group.key,
          groupId: undefined,
          expandable: true,
          isExpanded: false,
          className: 'transition-colors border border-border rounded-full',
        },
      ]
    }

    const clusterId = group.summary.icon
      ? `cluster-${group.key}-${group.summary.icon}`
      : `cluster-${group.key}`

    const connectedItems = group.items.map((item, index, arr) => {
      const isLast = index === arr.length - 1
      return {
        ...item,
        groupKey: group.key,
        groupId: clusterId,
        className: `rounded-none border border-border -ml-px border-l border-border ${isLast ? '' : ''}`,
      }
    })

    // Update summary tooltip to show collapse instruction when expanded
    const expandedSummaryTooltip = group.summary.tooltip
      ? group.summary.tooltip.replace(
          /<em>Click > to expand details<\/em>/,
          '<em>Click < to collapse</em>'
        )
      : group.summary.tooltip

    // Add collapse button at the end - inherit matched state from summary
    const collapseButton: ScrollablePillsItem = {
      label: '',
      groupKey: group.key,
      groupId: clusterId,
      type: 'summary',
      expandable: true,
      isExpanded: true,
      isMatched: Boolean(group.summary.isMatched), // Explicitly ensure boolean value
      isCollapseButton: true, // Mark as collapse button for special styling
      className: 'rounded-none rounded-r-full border border-border -ml-px',
    }

    return [
      {
        ...group.summary,
        tooltip: expandedSummaryTooltip,
        groupKey: group.key,
        groupId: clusterId,
        expandable: true,
        isExpanded: true,
        className: 'rounded-r-none pr-3 shadow-sm border border-border',
      },
      ...connectedItems,
      collapseButton,
    ]
  }

  const inlineItems = useMemo(() => {
    const groupedItems = normalizedGroups.flatMap(buildCluster)
    return [...preItems, ...groupedItems]
  }, [preItems, normalizedGroups, expandedGroups])

  const handleItemClick = (item: ScrollablePillsItem) => {
    const groupKey = item.groupKey
    if (!groupKey) return
    const group = groupByKey[groupKey]
    if (!group?.summary) return

    if (item.type === 'summary') {
      setExpandedGroups(prev => ({
        ...prev,
        [groupKey]: !prev[groupKey],
      }))
      return
    }

    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: false,
    }))
  }

  if (inlineItems.length === 0) {
    return null
  }

  return (
    <ScrollablePills
      items={inlineItems}
      variant={variant}
      fadeBackground={fadeBackground}
      onItemClick={handleItemClick}
    />
  )
}
