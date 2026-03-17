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
        sideOffset={5}
        collisionPadding={16}
        className="w-[260px] p-5 text-xs shadow-[0_10px_38px_-10px_hsl(206_22%_7%_/_35%),_0_10px_20px_-15px_hsl(206_22%_7%_/_20%)]"
      >
        {typeof content === 'string' ? (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          content
        )}
        <PopoverArrow className="fill-white" />
      </PopoverContent>
    </Popover>
  )
}
