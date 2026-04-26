'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent } from '@/components/ui/Popover';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import SearchInput from './SearchInput';
import { LOCATION_MIN_QUERY_LENGTH } from '@/lib/location-config';

const DEBOUNCE_MS = 300;

export type LocationSelection = {
  name: string;
  province: string;
  display_name: string;
  lat: number;
  lng: number;
};

/** Subset of LocationSelection stored on the profile (no name/province needed for display). */
export type LocationValue = Pick<LocationSelection, 'lat' | 'lng' | 'display_name'>;

interface LocationAutocompleteProps {
  value: LocationValue | null;
  onChange: (value: LocationSelection | null) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  inputId?: string;
}

function useDebounce(fn: (q: string) => void, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store fn in a ref so changing it never resets a pending timer.
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  });

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const debounced = useCallback(
    (q: string) => {
      cancel();
      timerRef.current = setTimeout(() => fnRef.current(q), delay);
    },
    [cancel, delay],
  );

  // Clean up any pending timer on unmount.
  useEffect(() => () => cancel(), [cancel]);

  return { debounced, cancel };
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder = '',
  hint,
  error: externalError,
  inputId,
}: LocationAutocompleteProps) {
  const t = useTranslations('profile');
  const listboxId = useId();

  const [query, setQuery] = useState(value?.display_name ?? '');
  const [hasSelection, setHasSelection] = useState(value !== null);
  const [results, setResults] = useState<LocationSelection[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setQuery(value?.display_name ?? '');
    setHasSelection(value !== null);
  }, [value?.display_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = useCallback(
    async (q: string) => {
      if (q.length < LOCATION_MIN_QUERY_LENGTH) {
        setResults([]);
        setIsOpen(false);
        return;
      }
      setIsSearching(true);
      setApiError(null);
      try {
        const res = await fetch(`/api/locations/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('Search failed');
        const data: LocationSelection[] = await res.json();
        setResults(data);
        setIsOpen(data.length > 0);
        setActiveIndex(0);
      } catch {
        setApiError(t('locationSearchError'));
        setResults([]);
        setIsOpen(false);
      } finally {
        setIsSearching(false);
      }
    },
    [t],
  );

  const { debounced: debouncedSearch, cancel: cancelDebounce } = useDebounce(search, DEBOUNCE_MS);

  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);

      if (hasSelection) {
        setHasSelection(false);
        onChange(null);
      }

      cancelDebounce();

      if (newQuery.length < LOCATION_MIN_QUERY_LENGTH) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      debouncedSearch(newQuery);
    },
    [hasSelection, onChange, cancelDebounce, debouncedSearch],
  );

  const handleSelect = (result: LocationSelection) => {
    setQuery(result.display_name);
    setHasSelection(true);
    setIsOpen(false);
    setResults([]);
    setApiError(null);
    onChange(result);
  };

  const handleClear = () => {
    setQuery('');
    setHasSelection(false);
    setResults([]);
    setIsOpen(false);
    setApiError(null);
    onChange(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const displayError = externalError ?? apiError;

  return (
    <div className="flex flex-col gap-1">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverPrimitive.Anchor asChild>
          <div onKeyDown={handleKeyDown}>
            <SearchInput
              query={query}
              onQueryChange={handleQueryChange}
              onClear={handleClear}
              placeholder={placeholder}
              isSearching={isSearching}
              inputRef={inputRef}
              listboxId={listboxId}
              id={inputId}
            />
          </div>
        </PopoverPrimitive.Anchor>

        <PopoverContent
          align="start"
          sideOffset={4}
          className="p-0 w-[var(--radix-popover-trigger-width)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={() => setIsOpen(false)}
        >
          <ul
            id={listboxId}
            role="listbox"
            aria-label={t('locationSuggestionsLabel')}
            className="max-h-60 overflow-y-auto py-1"
          >
            {results.map((result, i) => (
              <li
                key={`${result.lat}-${result.lng}`}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(result);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === activeIndex
                    ? 'bg-gray-100 dark:bg-zinc-800'
                    : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                }`}
              >
                {result.display_name}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      {hint && !displayError && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      {displayError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {displayError}
        </p>
      )}
    </div>
  );
}
