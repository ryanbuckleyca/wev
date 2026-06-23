'use client';

import { useRef, useState, useEffect } from 'react';

interface CollapsibleProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
  /** Optional DOM id (e.g. for an `aria-controls` reference). Must be unique per use. */
  id?: string;
}

export default function Collapsible({ isOpen, children, className, id }: CollapsibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const [wasEverOpen, setWasEverOpen] = useState(isOpen);

  const [maxHeight, setMaxHeight] = useState(() => (isOpen ? 'none' : '0px'));
  const shouldRenderContent = isOpen || wasEverOpen;

  useEffect(() => {
    if (isOpen) {
      setWasEverOpen(true);
    }
  }, [isOpen]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      if (isOpen) {
        setMaxHeight('none');
      }
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    let resetTimeout = 0;

    if (isOpen) {
      setMaxHeight(`${el.scrollHeight}px`);
      resetTimeout = window.setTimeout(() => {
        setMaxHeight('none');
      }, 300);
    } else {
      setMaxHeight(`${el.scrollHeight}px`);
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          setMaxHeight('0px');
        });
      });
    }

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(resetTimeout);
    };
  }, [isOpen, shouldRenderContent]);

  return (
    <div
      id={id}
      style={{
        overflow: 'hidden',
        maxHeight: shouldRenderContent ? maxHeight : '0px',
        transition: 'max-height 0.3s ease-in-out',
      }}
      aria-hidden={!isOpen}
      // Closed content stays in the DOM (for animation) but must not be
      // reachable by keyboard or assistive tech.
      inert={!isOpen || undefined}
    >
      {shouldRenderContent ? (
        <div ref={ref} className={className}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
