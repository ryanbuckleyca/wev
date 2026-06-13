import { Search, X, Loader2 } from 'lucide-react';

interface SearchInputProps {
  query: string;
  onQueryChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onClear: () => void;
  placeholder?: string;
  isSearching?: boolean;
  listboxId?: string;
  ariaDescribedBy?: string;
  id?: string;
  clearLabel?: string;
}

export default function SearchInput({
  query,
  onQueryChange,
  inputRef,
  onClear,
  placeholder,
  isSearching = false,
  listboxId,
  ariaDescribedBy,
  id,
  clearLabel = 'Clear search',
}: SearchInputProps) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-wev-btn bg-background border border-border px-3 py-2 transition-all focus-within:ring-2 focus-within:ring-ring dark:focus-within:border-border">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-describedby={ariaDescribedBy}
        className="min-w-0 flex-1 bg-transparent text-base sm:text-[13px] font-medium text-foreground outline-none placeholder:text-muted-foreground"
      />
      {isSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {query && !isSearching && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
