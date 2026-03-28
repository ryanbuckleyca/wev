'use client';

import { Lineicons } from '@lineiconshq/react-lineicons';
import { Funnel1Outlined } from '@lineiconshq/free-icons';

interface FilterIconProps {
  className?: string;
  reversed?: boolean;
  ariaHidden?: boolean;
}

export default function FilterIcon({
  className = '',
  reversed = false,
  ariaHidden = false,
}: FilterIconProps) {
  return (
    <Lineicons
      icon={Funnel1Outlined}
      size={16}
      className={`${className} ${reversed ? 'rotate-180' : ''}`}
      aria-hidden={ariaHidden}
    />
  );
}
