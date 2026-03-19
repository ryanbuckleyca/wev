import { useMemo, useRef, useEffect } from "react";
import { Lineicons } from "@lineiconshq/react-lineicons";
import { HeartSolid, Briefcase2Solid, LocationArrowRightSolid, ChevronDownOutlined } from "@lineiconshq/free-icons";
import { useScrollFades } from "@/hooks/useScrollFades";
import HorizontalScrollWithFades from "./HorizontalScrollWithFades";
import Pill from "@/components/Pill";
import InfoPopover from "@/components/InfoPopover";

export interface ScrollablePillsItem {
  label: string;
  tooltip?: string;
  isMatched?: boolean;
  icon?: 'heart' | 'briefcase' | 'location';
  type?: 'value' | 'skill' | 'summary' | 'workType';
  className?: string;
  groupId?: string;
  groupKey?: string;
  expandable?: boolean;
  isExpanded?: boolean;
  isCollapseButton?: boolean;
}

interface ScrollablePillsProps {
  items: string[] | ScrollablePillsItem[];
  variant?: "default" | "pink" | "gray";
  className?: string;
  fadeBackground?: string; // CSS color value matching the surrounding background, default "var(--card)"
  onItemClick?: (item: ScrollablePillsItem, index: number) => void;
  tight?: boolean;
}



export function ScrollablePills({
  items,
  variant = "default",
  className,
  fadeBackground = "var(--card)",
  onItemClick,
  tight = false,
}: ScrollablePillsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize items to always be objects
  const normalizedItems: ScrollablePillsItem[] = items.map(item => 
    typeof item === 'string' ? { label: item, isMatched: true } : item
  );

  const normalizedWithIndex = useMemo(() => normalizedItems.map((item, index) => ({ item, index })), [normalizedItems]);

  // Update logic no longer needs manual trigger as HorizontalScrollWithFades handles its own lifecycle

  const groupedItems = useMemo(() => {
    const groups: { groupId?: string; entries: { item: ScrollablePillsItem; index: number }[] }[] = []
    normalizedWithIndex.forEach(entry => {
      const groupKey = entry.item.groupId
      const lastGroup = groups[groups.length - 1]
      if (groupKey && lastGroup && lastGroup.groupId === groupKey) {
        lastGroup.entries.push(entry)
      } else {
        groups.push({ groupId: groupKey, entries: [entry] })
      }
    })
    return groups
  }, [normalizedWithIndex])

  const getVariantClass = (isMatched: boolean = true, type?: 'value' | 'skill' | 'summary' | 'workType', isCollapseButton?: boolean) => {
    const baseClasses = "border transition-colors";
    if (!isMatched) {
      return `${baseClasses} bg-muted text-muted-foreground border-border opacity-60`;
    }
    return `${baseClasses} bg-card text-foreground border-border hover:bg-muted`;
  };

  return (
    <HorizontalScrollWithFades
      containerClassName={className}
      className={tight ? 'gap-0' : 'gap-2'}
      fadeBackground={fadeBackground}
    >
      {groupedItems.map((group, groupIndex) => {
        const renderButton = (entry: { item: ScrollablePillsItem; index: number }) => {
          const { item, index } = entry
          const button = (
            <div
              key={item.label + index}
              className={`shrink-0 inline-flex items-center ${item.isCollapseButton ? 'gap-0 pl-0 pr-2.5' : 'gap-1.5 px-2.5'} py-1 rounded-full text-xs font-medium whitespace-nowrap ${getVariantClass(item.isMatched, item.type, item.isCollapseButton)} ${item.className || ''}`}
              style={{ touchAction: 'manipulation' }}
            >
              {item.icon === 'heart' ? (
                <Lineicons
                  icon={HeartSolid}
                  size={12}
                  className={`flex-shrink-0 ${item.isMatched ? 'text-wev-brand-accent' : 'text-gray-400'}`}
                />
              ) : item.icon === 'briefcase' ? (
                <Lineicons
                  icon={Briefcase2Solid}
                  size={12}
                  className={`flex-shrink-0 ${item.isMatched ? 'text-primary' : 'text-gray-400'}`}
                />
              ) : item.icon === 'location' ? (
                <Lineicons
                  icon={LocationArrowRightSolid}
                  size={12}
                  className={`flex-shrink-0 ${item.isMatched ? 'text-wev-info' : 'text-gray-400'}`}
                />
              ) : null}
              <span>{item.label || '\u00A0'}</span>
              {item.expandable && (
                <button
                  type="button"
                  onClick={() => onItemClick?.(item, index)}
                  className="flex items-center focus:outline-none -mr-1 pl-0.5"
                  aria-label={item.isExpanded ? 'Collapse' : 'Expand'}
                >
                  <div style={{ transition: 'transform 0.2s ease', transform: item.isExpanded ? 'rotate(90deg)' : 'rotate(-90deg)' }}>
                    <Lineicons icon={ChevronDownOutlined} size={11} className="text-muted-foreground" />
                  </div>
                </button>
              )}
            </div>
          )

          if (item.tooltip) {
            return (
              <InfoPopover
                key={item.label + index}
                content={item.tooltip}
              >
                {button}
              </InfoPopover>
            )
          }

          return button
        }

        if (group.groupId && group.entries.length > 1) {
          return (
            <div key={`group-${group.groupId}-${groupIndex}`} className="flex items-center gap-0">
              {group.entries.map(renderButton)}
            </div>
          )
        }

        return group.entries.map(entry => renderButton(entry))
      })}
    </HorizontalScrollWithFades>
  );
}
