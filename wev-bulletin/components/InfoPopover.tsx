'use client';

import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger, PopoverArrow } from '@/components/ui/Popover';

interface InfoPopoverProps {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  /** Accessible name for the trigger wrapper. */
  ariaLabel?: string;
  /** Applied to the trigger wrapper (e.g. -1 to skip in tab order). */
  triggerTabIndex?: number;
  /** Whether mouseover on desktop opens the popover (click/tap still works on touch). */
  hoverable?: boolean;
}

/**
 * InfoPopover Component
 *
 * Uses shadcn/ui Popover (Radix UI) for click/tap interactions,
 * with optional hoverable support for desktop mouseovers.
 * Matches the exact structure from Radix UI documentation.
 */
export default function InfoPopover({
  children,
  content,
  className = '',
  ariaLabel,
  triggerTabIndex,
  hoverable = false,
}: InfoPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Close popover if trigger is not visible
  React.useEffect(() => {
    if (!open || !triggerRef.current || typeof window.IntersectionObserver !== 'function') return;

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setOpen(false);
      },
      { threshold: 0.01 },
    );
    observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, [open]);

  const handleMouseEnter = () => {
    if (!hoverable) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (open) return;
    timerRef.current = setTimeout(() => {
      setOpen(true);
      timerRef.current = null;
    }, 350);
  };

  const handleMouseLeave = () => {
    if (!hoverable) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (open) {
      timerRef.current = setTimeout(() => {
        setOpen(false);
        timerRef.current = null;
      }, 150);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(nextOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div
          ref={triggerRef}
          className={`inline-flex cursor-help ${className}`}
          style={{ touchAction: 'manipulation' }}
          role="button"
          aria-label={ariaLabel}
          tabIndex={triggerTabIndex ?? 0}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={5}
        collisionPadding={16}
        className="w-[260px] p-5 text-xs border-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {typeof content === 'string' ? (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          content
        )}
        <PopoverArrow className="fill-border h-1 w-3" />
      </PopoverContent>
    </Popover>
  );
}
