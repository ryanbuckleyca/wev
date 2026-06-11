'use client';

import type { ReactNode } from 'react';

export interface FilterButtonOption {
  value: string;
  label: string;
}

interface FilterButtonGroupProps {
  label: ReactNode;
  options: FilterButtonOption[];
  isSelected: (value: string) => boolean;
  onSelect: (value: string) => void;
  helper?: ReactNode;
  className?: string;
}

export default function FilterButtonGroup({
  label,
  options,
  isSelected,
  onSelect,
  helper,
  className = 'mb-4',
}: FilterButtonGroupProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-foreground mb-2">{label}</label>
      {helper ? <div className="mb-2">{helper}</div> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={isSelected(option.value)}
            onClick={() => onSelect(option.value)}
            className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
              isSelected(option.value)
                ? 'bg-primary text-white'
                : 'bg-background text-foreground border border-border hover:bg-primary-tint'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
