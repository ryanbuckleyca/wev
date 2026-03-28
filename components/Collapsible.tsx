'use client';

import { useRef, useState, useEffect } from 'react';

interface CollapsibleProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function Collapsible({ isOpen, children, className }: CollapsibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState('0px');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      setHeight(isOpen ? `${el.scrollHeight}px` : '0px');
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  return (
    <div
      style={{
        overflow: 'hidden',
        maxHeight: height,
        transition: 'max-height 0.3s ease-in-out',
      }}
    >
      <div ref={ref} className={className}>
        {children}
      </div>
    </div>
  );
}
