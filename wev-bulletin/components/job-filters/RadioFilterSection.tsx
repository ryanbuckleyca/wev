'use client';

import { useId, type ReactNode } from 'react';
import { Radio } from '@/components/ui/Radio';
import { FILTER_LIST_BOX_CLASS } from './filter-list-box';

export interface RadioFilterOption {
  value: string;
  label: ReactNode;
}

interface RadioFilterSectionProps {
  label: ReactNode;
  name: string;
  options: RadioFilterOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  className?: string;
  listClassName?: string;
}

export default function RadioFilterSection({
  label,
  name,
  options,
  selectedValue,
  onSelect,
  className,
  listClassName = FILTER_LIST_BOX_CLASS,
}: RadioFilterSectionProps) {
  const labelId = useId();

  return (
    <div className={className}>
      <div id={labelId} className="block text-sm font-semibold text-foreground mb-2">
        {label}
      </div>
      <div className={listClassName} role="radiogroup" aria-labelledby={labelId}>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center space-x-2 py-1 px-2 rounded transition-colors cursor-pointer hover:bg-primary-tint"
          >
            <Radio
              name={name}
              value={option.value}
              checked={selectedValue === option.value}
              onChange={() => onSelect(option.value)}
            />
            <span className="text-sm text-foreground">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
