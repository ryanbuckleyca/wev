import { useMemo, useRef } from "react";
import { Lineicons } from "@lineiconshq/react-lineicons";
import { HeartSolid, Briefcase2Solid, LocationArrowRightSolid } from "@lineiconshq/free-icons";
import { useScrollFades } from "@/hooks/useScrollFades";
import Pill from "@/components/Pill";
import Tooltip from "@/components/Tooltip";

export interface ScrollablePillsItem {
  label: string;
  tooltip?: string;
  isMatched?: boolean;
  icon?: 'heart' | 'briefcase' | 'location';
  type?: 'value' | 'skill' | 'summary' | 'workType';
  className?: string;
  groupId?: string;
}

interface ScrollablePillsProps {
  items: string[] | ScrollablePillsItem[];
  variant?: "default" | "pink" | "gray";
  className?: string;
  fadeBackground?: string; // CSS color value matching the surrounding background, default "var(--card)"
  onItemClick?: (item: ScrollablePillsItem, index: number) => void;
  tight?: boolean;
}

const scrollbarHideStyle = `
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-hide {
    -ms-overflow-style: none; 
    scrollbar-width: none; 
  }
`;

export function ScrollablePills({
  items,
  variant = "default",
  className,
  fadeBackground = "var(--card)",
  onItemClick,
  tight = false,
}: ScrollablePillsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref, fades } = useScrollFades();

  // Normalize items to always be objects
  const normalizedItems: ScrollablePillsItem[] = items.map(item => 
    typeof item === 'string' ? { label: item, isMatched: true } : item
  );

  const normalizedWithIndex = useMemo(() => normalizedItems.map((item, index) => ({ item, index })), [normalizedItems]);

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

  const getVariantClass = (isMatched: boolean = true, type?: 'value' | 'skill' | 'summary' | 'workType') => {
    const baseClasses = "border transition-colors";
    if (!isMatched) {
      return `${baseClasses} bg-muted text-muted-foreground border-border opacity-60`;
    }
    return `${baseClasses} bg-card text-foreground border-border hover:bg-muted`;
  };

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <style>{scrollbarHideStyle}</style>
      {/* Left fade */}
      <div
        className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none z-10 transition-opacity duration-200"
        style={{
          background: `linear-gradient(to right, ${fadeBackground}, transparent)`,
          opacity: fades.left ? 1 : 0,
        }}
      />

      {/* Scrollable row */}
      <div
        ref={ref}
        className={`flex items-center ${tight ? 'gap-0' : 'gap-2'} overflow-x-auto scrollbar-hide`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {groupedItems.map((group, groupIndex) => {
          const renderButton = (entry: { item: ScrollablePillsItem; index: number }) => {
            const { item, index } = entry
            const button = (
              <button
                key={item.label + index}
                type="button"
                onClick={() => onItemClick?.(item, index)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getVariantClass(item.isMatched, item.type)} focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${item.className || ''}`}
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
                <span>{item.label}</span>
              </button>
            )

            if (item.tooltip) {
              const containerEl = containerRef.current
              return (
                <Tooltip
                  key={item.label + index}
                  content={item.tooltip}
                  appendTo={containerEl ? () => containerEl : undefined}
                  boundary={containerEl || undefined}
                >
                  {button}
                </Tooltip>
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
      </div>

      {/* Right fade */}
      <div
        className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10 transition-opacity duration-200"
        style={{
          background: `linear-gradient(to left, ${fadeBackground}, transparent)`,
          opacity: fades.right ? 1 : 0,
        }}
      />
    </div>
  );
}
