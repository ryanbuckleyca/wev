'use client';

export interface TogglePillOption {
  value: string;
  label: string;
}

interface TogglePillGroupProps {
  options: TogglePillOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}

export default function TogglePillGroup({
  options,
  selectedValues,
  onToggle,
}: TogglePillGroupProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((option) => {
        const isSelected = selectedValues.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(option.value)}
            className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-foreground border border-border hover:bg-wev-primary-tint active:bg-wev-primary-tint'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
