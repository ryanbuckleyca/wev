'use client'

import * as React from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverArrow,
} from '@/components/ui/popover'

interface InfoPopoverProps {
  children: React.ReactNode
  content: React.ReactNode
  className?: string
}

/**
 * InfoPopover Component
 * 
 * Uses shadcn/ui Popover (Radix UI) for click/tap interactions.
 * Matches the exact structure from Radix UI documentation.
 */
export default function InfoPopover({ children, content, className = '' }: InfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className={`inline-flex cursor-help ${className}`} style={{ touchAction: 'manipulation' }}>
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="PopoverContent"
        sideOffset={5}
        collisionPadding={16}
      >
        {typeof content === 'string' ? (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          content
        )}
        <PopoverArrow className="PopoverArrow" />
      </PopoverContent>
    </Popover>
  )
}
