import { useScrollFades } from "@/hooks/useScrollFades";
import Pill from "@/components/Pill";
import Tooltip from "@/components/Tooltip";

interface ScrollablePillsItem {
  label: string;
  tooltip?: string;
  isMatched?: boolean;
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

  const getVariantClass = (isMatched: boolean = true) => {
    if (!isMatched) {
      // Greyed out state for non-matching items
      if (variant === "pink") return "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-100 opacity-60";
      if (variant === "gray") return "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-100 opacity-60";
      return "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-100 opacity-60";
    }
    if (variant === "pink") return "bg-pink-50 text-pink-800 border-pink-200 hover:bg-pink-50";
    if (variant === "gray") return "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-50";
    return "";
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
            <Pill
              key={item.label + index}
              size="sm"
              className={`shrink-0 whitespace-nowrap ${getVariantClass(item.isMatched)}`}
            >
              {item.label}
            </Pill>
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
