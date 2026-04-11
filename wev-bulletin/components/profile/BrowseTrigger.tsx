import { forwardRef } from 'react';
import { Search } from 'lucide-react';

interface BrowseTriggerProps {
  onClick: () => void;
  isOpen: boolean;
  ariaLabel: string;
  placeholder: string;
}

const BrowseTrigger = forwardRef<HTMLButtonElement, BrowseTriggerProps>(
  ({ onClick, isOpen, ariaLabel, placeholder }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={ariaLabel}
      className="flex w-full items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-left transition-all hover:border-gray-200 dark:bg-zinc-900/50 dark:border-zinc-800 dark:hover:border-zinc-700"
    >
      <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      <span className="min-w-0 flex-1 text-[13px] font-medium text-gray-400" aria-hidden>
        {placeholder}
      </span>
    </button>
  ),
);

BrowseTrigger.displayName = 'BrowseTrigger';

export default BrowseTrigger;
