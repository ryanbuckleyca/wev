'use client'

import { ReactNode, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useScrollFades } from '@/hooks/useScrollFades'

interface HorizontalScrollWithFadesProps {
  children: ReactNode
  fadeBackground?: string // CSS color value (e.g. "var(--background)", "white")
  className?: string      // Applied to the scrollable container
  containerClassName?: string // Applied to the relative wrapper
}

/**
 * A reusable wrapper that provides horizontal scrolling with 
 * automatic gradient "fade" masks on the left and right edges.
 * Includes edge chevrons when there is more content to scroll in that direction.
 */
const scrollbarHideStyle = `
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-hide {
    -ms-overflow-style: none; 
    scrollbar-width: none; 
  }
`;

export default function HorizontalScrollWithFades({
  children,
  fadeBackground = 'var(--background)',
  className = '',
  containerClassName = '',
}: HorizontalScrollWithFadesProps) {
  const { ref, fades } = useScrollFades()

  const scrollBy = useCallback((direction: 'left' | 'right') => {
    const el = ref.current
    if (!el) return
    const scrollAmount = el.clientWidth * 0.6
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    })
  }, [ref])

  return (
    <div className={`relative ${containerClassName}`}>
      <style>{scrollbarHideStyle}</style>
      
      {/* Left fade + Chevron */}
      <div
        className="absolute left-0 -top-[0.5px] -bottom-[0.125px] w-16 pointer-events-none z-10 transition-opacity duration-200 flex items-center justify-start pb-2"
        style={{
          background: `linear-gradient(to right, ${fadeBackground}, ${fadeBackground} 50%, transparent)`,
          opacity: fades.left ? 1 : 0,
        }}
      >
        <button
          type="button"
          onClick={() => scrollBy('left')}
          className="pointer-events-auto absolute left-1 h-6 w-6 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-background transition-colors"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Row */}
      <div
        ref={ref}
        className={`flex gap-2 overflow-x-auto scrollbar-hide hide-scrollbar ${className}`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>

      {/* Right fade + Chevron */}
      <div
        className="absolute right-0 -top-[0.5px] -bottom-[0.125px] w-16 pointer-events-none z-10 transition-opacity duration-200 flex items-center justify-end pb-2"
        style={{
          background: `linear-gradient(to left, ${fadeBackground}, ${fadeBackground} 50%, transparent)`,
          opacity: fades.right ? 1 : 0,
        }}
      >
        <button
          type="button"
          onClick={() => scrollBy('right')}
          className="pointer-events-auto absolute right-1 h-6 w-6 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-background transition-colors"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
