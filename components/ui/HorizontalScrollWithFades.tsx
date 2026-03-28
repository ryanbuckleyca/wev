'use client'

import { ReactNode, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useScrollFades } from '@/hooks/useScrollFades'

interface HorizontalScrollWithFadesProps {
  children: ReactNode
  fadeBackground?: string // CSS color value (e.g. "var(--background)", "white")
  className?: string      // Applied to the scrollable container
  containerClassName?: string // Applied to the relative wrapper
  /** When false, scroll chevrons are never in tab order (e.g. modal chip strip). */
  chevronsTabbable?: boolean
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
  /* Gradient: no transition — instant on/off */
  .wev-hscroll-fade {
    transition: none !important;
  }
`;

export default function HorizontalScrollWithFades({
  children,
  fadeBackground = 'var(--background)',
  className = '',
  containerClassName = '',
  chevronsTabbable = true,
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
      
      {/* Left: gradient instant; chevron fades in */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16">
        <div
          className="wev-hscroll-fade absolute inset-0"
          style={{
            background: `linear-gradient(to right, ${fadeBackground}, ${fadeBackground} 50%, transparent)`,
            opacity: fades.left ? 1 : 0,
          }}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => scrollBy('left')}
          tabIndex={chevronsTabbable && fades.left ? 0 : -1}
          className="absolute left-1 top-1/2 z-[1] h-6 w-6 -translate-y-1/2 rounded-full border border-border bg-background/90 shadow-sm flex items-center justify-center text-foreground hover:bg-background"
          style={{
            opacity: fades.left ? 1 : 0,
            transition: 'opacity 200ms ease-out, background-color 150ms ease',
            pointerEvents: fades.left ? 'auto' : 'none',
          }}
          aria-label="Scroll left"
          aria-hidden={!fades.left}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Row — z-0 keeps edge overlays above */}
      <div
        ref={ref}
        tabIndex={chevronsTabbable ? undefined : -1}
        className={`relative z-0 flex gap-2 overflow-x-auto scrollbar-hide hide-scrollbar ${className}`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>

      {/* Right: gradient instant; chevron fades in */}
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16">
        <div
          className="wev-hscroll-fade absolute inset-0"
          style={{
            background: `linear-gradient(to left, ${fadeBackground}, ${fadeBackground} 50%, transparent)`,
            opacity: fades.right ? 1 : 0,
          }}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => scrollBy('right')}
          tabIndex={chevronsTabbable && fades.right ? 0 : -1}
          className="absolute right-1 top-1/2 z-[1] h-6 w-6 -translate-y-1/2 rounded-full border border-border bg-background/90 shadow-sm flex items-center justify-center text-foreground hover:bg-background"
          style={{
            opacity: fades.right ? 1 : 0,
            transition: 'opacity 200ms ease-out, background-color 150ms ease',
            pointerEvents: fades.right ? 'auto' : 'none',
          }}
          aria-label="Scroll right"
          aria-hidden={!fades.right}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
