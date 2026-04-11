'use client';

import { useRef, useState, useEffect } from 'react';

interface CollapsibleProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function Collapsible({ isOpen, children, className }: CollapsibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const [maxHeight, setMaxHeight] = useState(() => (isOpen ? 'none' : '0px'));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
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
  }, [isOpen]);

  return (
    <div
      style={{
        overflow: 'hidden',
        maxHeight,
        transition: 'max-height 0.3s ease-in-out',
      }}
      aria-hidden={!isOpen}
    >
      <div ref={ref} className={className}>
        {children}
      </div>
    </div>
  );
}
