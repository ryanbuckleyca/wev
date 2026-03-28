'use client';

import { useRef } from 'react';

interface CollapsibleProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function Collapsible({ isOpen, children, className }: CollapsibleProps) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      style={{
        overflow: 'hidden',
        maxHeight: isOpen ? `${ref.current?.scrollHeight ?? 9999}px` : '0px',
        transition: 'max-height 0.3s ease-in-out',
      }}
    >
      <div ref={ref} className={className}>
        {children}
      </div>
    </div>
  );
}
