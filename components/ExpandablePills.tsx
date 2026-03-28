'use client'

import { useMemo, useState, useEffect } from 'react'
import { ScrollablePills, ScrollablePillsItem } from '@/components/ui/ScrollablePills'

/** Delay between mounting each segment while expanding */
const EXPAND_STAGGER_MS = 88

const EXPAND_PILL_ENTER_STYLE = `
@keyframes wev-expand-pill-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}
.wev-expand-pill-enter {
  animation: wev-expand-pill-enter 280ms ease-out both;
}
@media (prefers-reduced-motion: reduce) {
  .wev-expand-pill-enter {
    animation: none;
  }
}
`

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
  /**
   * Per group: 1 = expanded summary only, 2.. = +items, max = +collapse.
   * maxStage = items.length + 2 (summary + n items + collapse).
   */
  const [expandStage, setExpandStage] = useState<Record<string, number>>({})

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

    const maxStage = group.items.length + 2
    const stage = expandStage[group.key] ?? maxStage
    const sliceCount = Math.min(Math.max(0, stage - 1), group.items.length)
    const visibleItems = group.items.slice(0, sliceCount)
    const collapseShown = stage >= maxStage

    const connectedItems = visibleItems.map((item, index, arr) => {
      const isLast = index === arr.length - 1
      return {
        ...item,
        groupKey: group.key,
        groupId: clusterId,
        className: `wev-expand-pill-enter rounded-none border border-border -ml-px border-l border-border ${isLast ? '' : ''}`,
      }
    })

    const expandedSummaryTooltip = group.summary.tooltip
      ? group.summary.tooltip.replace(
          /<em>Click > to expand details<\/em>/,
          '<em>Click < to collapse</em>'
        )
      : group.summary.tooltip

    const collapseButton: ScrollablePillsItem = {
      label: '',
      groupKey: group.key,
      groupId: clusterId,
      type: 'summary',
      expandable: true,
      isExpanded: true,
      isMatched: Boolean(group.summary.isMatched),
      isCollapseButton: true,
      className: 'wev-expand-pill-enter rounded-none rounded-r-full border border-border -ml-px',
    }

    /** No enter animation on summary — avoids flash when swapping from collapsed chip */
    const summaryPill: ScrollablePillsItem = {
      ...group.summary,
      tooltip: expandedSummaryTooltip,
      groupKey: group.key,
      groupId: clusterId,
      expandable: true,
      isExpanded: true,
      className: 'rounded-r-none pr-3 shadow-sm border border-border',
    }

    return collapseShown
      ? [summaryPill, ...connectedItems, collapseButton]
      : [summaryPill, ...connectedItems]
  }

  const inlineItems = useMemo(() => {
    const groupedItems = normalizedGroups.flatMap(buildCluster)
    return [...preItems, ...groupedItems]
  }, [preItems, normalizedGroups, expandedGroups, expandStage])

  /** Advance one segment per tick while expanding */
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    normalizedGroups.forEach((group) => {
      if (!group.summary) return
      const key = group.key
      if (!expandedGroups[key]) return
      const maxStage = group.items.length + 2
      const stage = expandStage[key]
      if (stage === undefined || stage >= maxStage) return

      const t = setTimeout(() => {
        setExpandStage((prev) => ({
          ...prev,
          [key]: Math.min(maxStage, (prev[key] ?? 0) + 1),
        }))
      }, EXPAND_STAGGER_MS)
      timers.push(t)
    })
    return () => timers.forEach(clearTimeout)
  }, [expandedGroups, expandStage, normalizedGroups])

  const handleItemClick = (item: ScrollablePillsItem) => {
    const groupKey = item.groupKey
    if (!groupKey) return
    const group = groupByKey[groupKey]
    if (!group?.summary) return

    if (item.type === 'summary') {
      const willExpand = !expandedGroups[groupKey]
      setExpandedGroups((prev) => ({
        ...prev,
        [groupKey]: !prev[groupKey],
      }))
      if (willExpand) {
        setExpandStage((prev) => ({ ...prev, [groupKey]: 1 }))
      } else {
        setExpandStage((prev) => {
          const next = { ...prev }
          delete next[groupKey]
          return next
        })
      }
      return
    }

    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: false,
    }))
    setExpandStage((prev) => {
      const next = { ...prev }
      delete next[groupKey]
      return next
    })
  }

  if (inlineItems.length === 0) {
    return null
  }

  return (
    <>
      <style>{EXPAND_PILL_ENTER_STYLE}</style>
      <ScrollablePills
        items={inlineItems}
        variant={variant}
        fadeBackground={fadeBackground}
        onItemClick={handleItemClick}
      />
    </>
  )
}
