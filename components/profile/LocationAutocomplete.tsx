'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent } from '@/components/ui/Popover';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import SearchInput from './SearchInput';

type LocationResult = {
  name: string;
  province: string;
  display_name: string;
  lat: number;
  lng: number;
};

export type LocationValue = {
  lat: number;
  lng: number;
  display_name: string;
};

export type LocationSelection = {
  lat: number;
  lng: number;
  display_name: string;
  name: string;
  province: string;
};

interface LocationAutocompleteProps {
  value: LocationValue | null;
  onChange: (value: LocationSelection | null) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder = 'Search for a city…',
  hint,
  error: externalError,
}: LocationAutocompleteProps) {
  const t = useTranslations();
  const listboxId = useId();

  // The text shown in the input
  const [query, setQuery] = useState(value?.display_name ?? '');
  // Whether a selection has been made (guards stale coords)
  const [hasSelection, setHasSelection] = useState(value !== null);
  // Dropdown results
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  // Sync display when value prop changes externally
  useEffect(() => {
    setQuery(value?.display_name ?? '');
    setHasSelection(value !== null);
  }, [value]);

  const search = useCallback(async (q: string) => {
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsSearching(true);
    setApiError(null);
    try {
      const res = await fetch(`/api/locations/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('Search failed');
      const data: LocationResult[] = await res.json();
      setResults(data);
      setIsOpen(data.length > 0);
      setActiveIndex(0);
    } catch {
      setApiError('Could not load location results. Please try again.');
      setResults([]);
      setIsOpen(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);

    // Stale-coord guard (Req 2.11): if user modifies text after a selection, clear coords
    if (hasSelection) {
      setHasSelection(false);
      onChange(null);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (newQuery.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      search(newQuery);
    }, DEBOUNCE_MS);
  };

  const handleSelect = (result: LocationResult) => {
    setQuery(result.display_name);
    setHasSelection(true);
    setIsOpen(false);
    setResults([]);
    setApiError(null);
    onChange({
      lat: result.lat,
      lng: result.lng,
      display_name: result.display_name,
      name: result.name,
      province: result.province,
    });
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
          <div ref={anchorRef} onKeyDown={handleKeyDown}>
            <SearchInput
              query={query}
              onQueryChange={handleQueryChange}
              onClear={handleClear}
              placeholder={placeholder}
              isSearching={isSearching}
              inputRef={inputRef}
              listboxId={listboxId}
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
            aria-label="Location suggestions"
            className="max-h-60 overflow-y-auto py-1"
          >
            {results.map((result, i) => (
              <li
                key={`${result.display_name}-${i}`}
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

      {hint && !displayError && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      )}
      {displayError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {displayError}
        </p>
      )}
    </div>
  );
}
