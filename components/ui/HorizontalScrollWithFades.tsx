'use client'

import { ReactNode } from 'react'
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

  return (
    <div className={`relative ${containerClassName}`}>
      <style>{scrollbarHideStyle}</style>
      {/* Left fade */}
      <div
        className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none z-10 transition-opacity duration-200"
        style={{
          background: `linear-gradient(to right, ${fadeBackground}, transparent)`,
          opacity: fades.left ? 1 : 0,
        }}
      />

      {/* Scrollable Row */}
      <div
        ref={ref}
        className={`flex items-center gap-2 overflow-x-auto scrollbar-hide hide-scrollbar ${className}`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>

      {/* Right fade */}
      <div
        className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none z-10 transition-opacity duration-200"
        style={{
          background: `linear-gradient(to left, ${fadeBackground}, transparent)`,
          opacity: fades.right ? 1 : 0,
        }}
      />
    </div>
  )
}
