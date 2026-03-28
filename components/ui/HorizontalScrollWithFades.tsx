'use client';

import { ReactNode, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useScrollFades } from '@/hooks/useScrollFades';

interface HorizontalScrollWithFadesProps {
  children: ReactNode;
  fadeBackground?: string;
  className?: string;
  containerClassName?: string;
  /** When false, scroll chevrons are never in tab order (e.g. modal chip strip). */
  chevronsTabbable?: boolean;
}

function EdgeFade({
  direction,
  visible,
  tabbable,
  fadeBackground,
  onScroll,
}: {
  direction: 'left' | 'right';
  visible: boolean;
  tabbable: boolean;
  fadeBackground: string;
  onScroll: (dir: 'left' | 'right') => void;
}) {
  const isLeft = direction === 'left';
  const Icon = isLeft ? ChevronLeft : ChevronRight;

  return (
    <div
      className={`pointer-events-none absolute inset-y-0 ${isLeft ? 'left-0' : 'right-0'} z-10 w-16`}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to ${isLeft ? 'right' : 'left'}, ${fadeBackground}, ${fadeBackground} 50%, transparent)`,
          opacity: visible ? 1 : 0,
          transition: 'none',
        }}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => onScroll(direction)}
        tabIndex={tabbable && visible ? 0 : -1}
        className={`absolute ${isLeft ? 'left-1' : 'right-1'} top-1/2 z-[1] h-6 w-6 -translate-y-1/2 rounded-full border border-border bg-background/90 shadow-sm flex items-center justify-center text-foreground hover:bg-background`}
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 200ms ease-out, background-color 150ms ease',
          pointerEvents: visible ? 'auto' : 'none',
        }}
        aria-label={`Scroll ${direction}`}
        aria-hidden={!visible}
      >
        <Icon className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function HorizontalScrollWithFades({
  children,
  fadeBackground = 'var(--background)',
  className = '',
  containerClassName = '',
  chevronsTabbable = true,
}: HorizontalScrollWithFadesProps) {
  const { ref, fades } = useScrollFades();

  const scrollBy = useCallback(
    (direction: 'left' | 'right') => {
      const el = ref.current;
      if (!el) return;
      el.scrollBy({
        left: direction === 'left' ? -el.clientWidth * 0.6 : el.clientWidth * 0.6,
        behavior: 'smooth',
      });
    },
    [ref],
  );

  return (
    <div className={`relative ${containerClassName}`}>
      <EdgeFade
        direction="left"
        visible={fades.left}
        tabbable={chevronsTabbable}
        fadeBackground={fadeBackground}
        onScroll={scrollBy}
      />
      <div
        ref={ref}
        tabIndex={chevronsTabbable ? undefined : -1}
        className={`relative z-0 flex gap-2 overflow-x-auto scrollbar-hide ${className}`}
      >
        {children}
      </div>
      <EdgeFade
        direction="right"
        visible={fades.right}
        tabbable={chevronsTabbable}
        fadeBackground={fadeBackground}
        onScroll={scrollBy}
      />
    </div>
  );
}
