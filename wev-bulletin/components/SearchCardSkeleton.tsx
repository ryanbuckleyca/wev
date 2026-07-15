import { Lineicons } from '@lineiconshq/react-lineicons';
import { Search1Outlined } from '@lineiconshq/free-icons';
import FilterIcon from '@/components/FilterIcon';
import CountPhraseSkeleton from '@/components/CountPhraseSkeleton';

type SearchCardSkeletonProps = {
  /** Accessible label for the disabled search input */
  label: string;
  placeholder: string;
  inputId: string;
  /** Visible filter-button label (hidden below 520px, matching SearchBar) */
  filtersLabel: string;
};

/**
 * Disabled search chrome for route/page loading states (jobs + orgs).
 * Mirrors SearchBar layout without interactive wiring.
 */
export default function SearchCardSkeleton({
  label,
  placeholder,
  inputId,
  filtersLabel,
}: SearchCardSkeletonProps) {
  return (
    <div className="bg-card border border-border rounded-wev-card mb-4 overflow-hidden">
      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <label htmlFor={inputId} className="sr-only">
              {label}
            </label>
            <Lineicons
              icon={Search1Outlined}
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-wev-text-tertiary pointer-events-none"
              aria-hidden
            />
            <input
              type="text"
              id={inputId}
              disabled
              placeholder={placeholder}
              className="w-full h-10 pl-9 pr-10 border border-border rounded-wev-btn bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors cursor-not-allowed opacity-50"
            />
          </div>

          <button
            type="button"
            disabled
            className="h-10 px-3 border border-border rounded-wev-btn bg-card text-sm text-muted-foreground hover:border-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap opacity-50 cursor-not-allowed"
          >
            <FilterIcon className="w-4 h-4" aria-hidden />
            <span className="max-[519px]:hidden">{filtersLabel}</span>
            <span className="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-primary text-white text-xs font-semibold">
              0
            </span>
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-4 py-2.5 bg-muted border-t border-border">
        <span role="status" aria-busy="true">
          <CountPhraseSkeleton className="w-36" />
        </span>
      </div>
    </div>
  );
}
