'use client'

import * as React from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverArrow,
} from '@/components/ui/popover'

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  className?: string
}

/**
 * Tooltip Component (Popover-based)
 * 
 * Uses shadcn/ui Popover (Radix UI) instead of Tooltip for proper mobile support.
 * Popovers are designed for click/tap interactions and work reliably on touch devices.
 * 
 * BEHAVIOR:
 * - Click/tap to show, click outside/ESC to hide
 * - Works consistently on desktop and mobile
 * - Positioning: Automatically flips to stay in viewport with collision detection
 * - Portal rendering: No z-index issues
 * - Accessibility: Full WCAG 2.1 compliance built-in
 */
export default function InfoPopover({ children, content, className = '' }: TooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className={`inline-flex cursor-help ${className}`} style={{ touchAction: 'manipulation' }}>
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent 
        side="top" 
        sideOffset={5}
        align="center"
        collisionPadding={16}
        className="max-w-[300px] text-xs p-3"
      >
        {typeof content === 'string' ? (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          content
        )}
        <PopoverArrow className="fill-popover" />
      </PopoverContent>
    </Popover>
  )
}
