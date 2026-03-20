'use client'

import * as React from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverArrow,
} from '@/components/ui/Popover'

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
        side="top"
        sideOffset={5}
        collisionPadding={16}
        className="w-[260px] p-5 text-xs border-0"
      >
        {typeof content === 'string' ? (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          content
        )}
        <PopoverArrow className="fill-border h-1 w-3" />
      </PopoverContent>
    </Popover>
  )
}
