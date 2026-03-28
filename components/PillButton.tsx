'use client';

import React, { ReactNode } from 'react';

interface PillButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  'aria-label'?: string;
  'aria-pressed'?: boolean;
}

export default function PillButton({
  children,
  onClick,
  className = '',
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
}: PillButtonProps) {
  const baseClasses =
    'flex items-stretch border border-border rounded-full overflow-hidden self-stretch min-h-[28px] transition-all duration-500 ease-in-out h-full';
  const combinedClasses = `${baseClasses} ${className}`.trim();

  return (
    <div className={combinedClasses}>
      {React.cloneElement(children as React.ReactElement<any>, {
        onClick,
        'aria-label': ariaLabel,
        'aria-pressed': ariaPressed,
      })}
    </div>
  );
}
