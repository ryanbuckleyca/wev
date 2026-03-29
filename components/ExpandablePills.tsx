'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { ScrollablePills, ScrollablePillsItem } from '@/components/ui/ScrollablePills';

const EXPAND_STAGGER_MS = 88;

const PILL_ENTER = 'animate-pill-enter motion-reduce:animate-none';

export interface ExpandablePillGroup {
  key: string;
  summary?: ScrollablePillsItem;
  items: ScrollablePillsItem[];
}

interface ExpandablePillsProps {
  preItems?: ScrollablePillsItem[];
  groups: ExpandablePillGroup[];
  variant?: 'default' | 'pink' | 'gray';
  fadeBackground?: string;
}

export default function ExpandablePills({
  preItems = [],
  groups,
  variant = 'default',
  fadeBackground = 'var(--card)',
}: ExpandablePillsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  /**
   * Per group: 1 = expanded summary only, 2.. = +items, max = +collapse.
   * maxStage = items.length + 2 (summary + n items + collapse).
   */
  const [expandStage, setExpandStage] = useState<Record<string, number>>({});
  const staggerTimers = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());

  useEffect(() => () => staggerTimers.current.forEach((t) => t.forEach(clearTimeout)), []);

  const cancelStagger = (key: string) => {
    staggerTimers.current.get(key)?.forEach(clearTimeout);
    staggerTimers.current.delete(key);
  };

  const normalizedGroups = useMemo(
    () => groups.filter((group) => group.summary || group.items.length > 0),
    [groups],
  );

  const groupByKey = useMemo(
    () => Object.fromEntries(normalizedGroups.map((group) => [group.key, group])),
    [normalizedGroups],
  );

  const inlineItems = useMemo(() => {
    const buildCluster = (group: ExpandablePillGroup): ScrollablePillsItem[] => {
      if (!group.summary) {
        return group.items.map((item) => ({
          ...item,
          groupKey: group.key,
        }));
      }

      const isExpanded = Boolean(expandedGroups[group.key]) && group.items.length > 0;
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
        ];
      }

      const clusterId = group.summary.icon
        ? `cluster-${group.key}-${group.summary.icon}`
        : `cluster-${group.key}`;

      const maxStage = group.items.length + 2;
      const stage = expandStage[group.key] ?? maxStage;
      const sliceCount = Math.min(Math.max(0, stage - 1), group.items.length);
      const visibleItems = group.items.slice(0, sliceCount);
      const collapseShown = stage >= maxStage;

      const connectedItems = visibleItems.map((item) => ({
        ...item,
        groupKey: group.key,
        groupId: clusterId,
        className: `${PILL_ENTER} rounded-none border border-border -ml-px`,
      }));

      const expandedSummaryTooltip = group.summary.tooltip
        ? group.summary.tooltip.replace(
            /<em>Click > to expand details<\/em>/,
            '<em>Click < to collapse</em>',
          )
        : group.summary.tooltip;

      const collapseButton: ScrollablePillsItem = {
        label: '',
        groupKey: group.key,
        groupId: clusterId,
        type: 'summary',
        expandable: true,
        isExpanded: true,
        isMatched: Boolean(group.summary.isMatched),
        isCollapseButton: true,
        className: `${PILL_ENTER} rounded-none rounded-r-full border border-border -ml-px`,
      };

      const summaryPill: ScrollablePillsItem = {
        ...group.summary,
        tooltip: expandedSummaryTooltip,
        groupKey: group.key,
        groupId: clusterId,
        expandable: true,
        isExpanded: true,
        // Match the default pill background and border
        className: 'rounded-r-none pr-3 bg-card text-foreground border border-border',
      };

      return collapseShown
        ? [summaryPill, ...connectedItems, collapseButton]
        : [summaryPill, ...connectedItems];
    };

    const groupedItems = normalizedGroups.flatMap(buildCluster);
    return [...preItems, ...groupedItems];
  }, [preItems, normalizedGroups, expandedGroups, expandStage]);

  const collapseGroup = (key: string) => {
    cancelStagger(key);
    setExpandedGroups((prev) => ({ ...prev, [key]: false }));
    setExpandStage((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  };

  const handleItemClick = (item: ScrollablePillsItem) => {
    const groupKey = item.groupKey;
    if (!groupKey) return;
    const group = groupByKey[groupKey];
    if (!group?.summary) return;

    if (item.type === 'summary') {
      if (expandedGroups[groupKey]) {
        collapseGroup(groupKey);
        return;
      }

      const maxStage = group.items.length + 2;
      setExpandedGroups((prev) => ({ ...prev, [groupKey]: true }));
      setExpandStage((prev) => ({ ...prev, [groupKey]: 1 }));

      const timers = Array.from({ length: maxStage - 1 }, (_, i) =>
        setTimeout(
          () => setExpandStage((prev) => ({ ...prev, [groupKey]: i + 2 })),
          (i + 1) * EXPAND_STAGGER_MS,
        ),
      );
      staggerTimers.current.set(groupKey, timers);
      return;
    }

    collapseGroup(groupKey);
  };

  if (inlineItems.length === 0) return null;

  return (
    <ScrollablePills
      items={inlineItems}
      variant={variant}
      fadeBackground={fadeBackground}
      onItemClick={handleItemClick}
    />
  );
}
