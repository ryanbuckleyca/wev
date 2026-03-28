import Button from '@/components/Button';

interface PillSelectorProps {
  options: readonly string[];
  selectedOptions: string[];
  onSelectionChange: (selected: string[]) => void;
  multiSelect?: boolean;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export default function PillSelector({
  options,
  selectedOptions,
  onSelectionChange,
  multiSelect = true,
  columns = 3,
  className = '',
}: PillSelectorProps) {
  const toggleOption = (option: string) => {
    if (multiSelect) {
      if (selectedOptions.includes(option)) {
        onSelectionChange(selectedOptions.filter((o) => o !== option));
      } else {
        onSelectionChange([...selectedOptions, option]);
      }
    } else {
      // Single select: replace the selection
      onSelectionChange([option]);
    }
  };

  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  };

  return (
    <div className={`grid ${gridClasses[columns]} sm:grid-cols-3 gap-2 ${className}`.trim()}>
      {options.map((option) => (
        <Button
          key={option}
          onClick={() => toggleOption(option)}
          size="sm"
          fullWidth
          className="px-3 py-2"
          style={{
            background: selectedOptions.includes(option) ? 'var(--primary)' : 'var(--background)',
            color: selectedOptions.includes(option) ? 'white' : 'var(--foreground)',
            border: `2px solid ${selectedOptions.includes(option) ? 'var(--primary)' : 'var(--border)'}`,
          }}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}
