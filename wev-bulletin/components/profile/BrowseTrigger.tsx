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
      className="flex w-full items-center gap-2 rounded-wev-btn bg-background border border-border px-3 py-2 text-left transition-all hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 text-[13px] font-medium text-muted-foreground" aria-hidden>
        {placeholder}
      </span>
    </button>
  ),
);

BrowseTrigger.displayName = 'BrowseTrigger';

export default BrowseTrigger;
