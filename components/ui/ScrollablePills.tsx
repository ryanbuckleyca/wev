import { useScrollFades } from "@/hooks/useScrollFades";
import Pill from "@/components/Pill";
import Tooltip from "@/components/Tooltip";

interface ScrollablePillsItem {
  label: string;
  tooltip?: string;
  isMatched?: boolean;
  icon?: 'heart' | 'briefcase';
  type?: 'value' | 'skill';
}

interface ScrollablePillsProps {
  items: string[] | ScrollablePillsItem[];
  variant?: "default" | "pink" | "gray";
  className?: string;
  fadeBackground?: string; // match your card background color, default "white"
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
  fadeBackground = "white",
}: ScrollablePillsProps) {
  const { ref, fades } = useScrollFades();

  // Normalize items to always be objects
  const normalizedItems: ScrollablePillsItem[] = items.map(item => 
    typeof item === 'string' ? { label: item, isMatched: true } : item
  );

  const getVariantClass = (isMatched: boolean = true, type?: 'value' | 'skill') => {
    const baseClasses = "border transition-colors";
    if (!isMatched) {
      // Desaturated state for non-matching items
      return `${baseClasses} bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 opacity-60`;
    }
    // Saturated state for matching items - standard colors
    return `${baseClasses} bg-white text-gray-900 border-gray-300 hover:bg-gray-50`;
  };

  return (
    <div className={`relative ${className || ''}`}>
      <style>{scrollbarHideStyle}</style>
      {/* Left fade */}
      <div
        className="absolute left-0 top-0 bottom-1 w-8 pointer-events-none z-10 transition-opacity duration-200"
        style={{
          background: `linear-gradient(to right, ${fadeBackground}, transparent)`,
          opacity: fades.left ? 1 : 0,
        }}
      />

      {/* Scrollable row */}
      <div
        ref={ref}
        className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {normalizedItems.map((item, index) => {
          const pill = (
            <span
              key={item.label + index}
              className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getVariantClass(item.isMatched, item.type)}`}
            >
              {item.icon === 'heart' ? (
                <span className={`flex-shrink-0 ${item.isMatched ? 'text-wev-brand-accent' : 'text-gray-400'}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                </span>
              ) : item.icon === 'briefcase' ? (
                <span className={`flex-shrink-0 ${item.isMatched ? 'text-primary' : 'text-gray-400'}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                    <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/>
                  </svg>
                </span>
              ) : null}
              <span>{item.label}</span>
            </span>
          );
          
          // Wrap in tooltip if tooltip content exists
          if (item.tooltip) {
            return (
              <Tooltip key={item.label + index} content={item.tooltip}>
                {pill}
              </Tooltip>
            );
          }
          
          return pill;
        })}
      </div>

      {/* Right fade */}
      <div
        className="absolute right-0 top-0 bottom-1 w-12 pointer-events-none z-10 transition-opacity duration-200"
        style={{
          background: `linear-gradient(to left, ${fadeBackground}, transparent)`,
          opacity: fades.right ? 1 : 0,
        }}
      />
    </div>
  );
}
