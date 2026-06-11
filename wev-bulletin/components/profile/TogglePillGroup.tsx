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
            className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-primary text-white shadow-sm'
                : 'bg-gray-50 text-gray-700 border border-gray-100 dark:bg-zinc-800 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-700'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
