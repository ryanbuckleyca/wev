'use client';

import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';

interface CheckboxFilterSectionProps {
  label: ReactNode;
  selectedCount: number;
  totalCount: number;
  options: string[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  emptyMessage: ReactNode;
  className?: string;
  listClassName?: string;
  renderLabel?: (value: string) => ReactNode;
  isIndeterminate?: (value: string) => boolean;
  disabledValues?: string[];
  disabledTooltipMessage?: string;
}

export default function CheckboxFilterSection({
  label,
  selectedCount,
  totalCount,
  options,
  selectedValues,
  onToggle,
  emptyMessage,
  className,
  listClassName = 'max-h-32 overflow-y-auto border border-border rounded-wev-btn p-2 bg-background',
  renderLabel,
  isIndeterminate,
  disabledValues = [],
  disabledTooltipMessage,
}: CheckboxFilterSectionProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-foreground mb-2">
        {label} ({selectedCount}/{totalCount})
      </label>
      <div className={listClassName}>
        {options.length > 0 ? (
          options.map((option) => {
            const isDisabled = disabledValues.includes(option);
            return (
              <label
                key={option}
                className={`flex items-center space-x-2 py-1 px-2 rounded transition-colors ${
                  isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-primary-tint'
                }`}
                title={isDisabled ? disabledTooltipMessage : undefined}
              >
                <Checkbox
                  checked={selectedValues.includes(option)}
                  indeterminate={isIndeterminate?.(option)}
                  onChange={() => !isDisabled && onToggle(option)}
                  disabled={isDisabled}
                />
                <span className="text-sm text-foreground">
                  {renderLabel ? renderLabel(option) : option}
                </span>
              </label>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground italic px-2 py-2">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}
