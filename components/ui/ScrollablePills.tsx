import { useScrollFades } from "@/hooks/useScrollFades";
import Pill from "@/components/Pill";

interface ScrollablePillsProps {
  items: string[];
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

  const getVariantClass = () => {
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
        {items.map((item) => (
          <Pill
            key={item}
            size="sm"
            className={`shrink-0 whitespace-nowrap ${getVariantClass()}`}
          >
            {item}
          </Pill>
        ))}
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
