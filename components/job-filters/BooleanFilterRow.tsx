'use client';

import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';

interface BooleanFilterRowProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
  testId?: string;
}

export default function BooleanFilterRow({
  checked,
  onCheckedChange,
  label,
  description,
  icon,
  className = 'mb-4',
  testId,
}: BooleanFilterRowProps) {
  return (
    <div className={className} data-testid={testId}>
      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />
        {icon}
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </label>
      {description ? (
        <p className="text-xs text-muted-foreground mt-1 pl-7">{description}</p>
      ) : null}
    </div>
  );
}
