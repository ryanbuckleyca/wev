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
  /** Applied to the trigger wrapper (e.g. -1 to skip in tab order). */
  triggerTabIndex?: number
}

/**
 * InfoPopover Component
 * 
 * Uses shadcn/ui Popover (Radix UI) for click/tap interactions.
 * Matches the exact structure from Radix UI documentation.
 */
export default function InfoPopover({
  children,
  content,
  className = '',
  triggerTabIndex,
}: InfoPopoverProps) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLDivElement>(null)

  // Close popover if trigger is not visible
  React.useEffect(() => {
    if (!open || !triggerRef.current) return

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setOpen(false)
      },
      { threshold: 0.01 }
    )
    observer.observe(triggerRef.current)
    return () => observer.disconnect()
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          ref={triggerRef}
          className={`inline-flex cursor-help ${className}`}
          style={{ touchAction: 'manipulation' }}
          tabIndex={triggerTabIndex}
        >
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
