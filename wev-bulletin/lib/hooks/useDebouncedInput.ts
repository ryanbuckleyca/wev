'use client';

import { useState, useEffect, useRef } from 'react';
import { useDebounce } from './useDebounce';

/**
 * Manages a debounced text input that can be driven by an external value.
 *
 * - `localValue` / `setLocalValue`: bind directly to the input element.
 * - External changes to `externalValue` (e.g. "clear all filters") are synced
 *   back into local state automatically.
 * - `onCommit` is called after the debounce delay whenever the local value
 *   diverges from the last committed value.
 */
export function useDebouncedInput(
  externalValue: string,
  delay: number,
  onCommit: (value: string) => void,
) {
  const [localValue, setLocalValue] = useState(externalValue);
  const debouncedValue = useDebounce(localValue, delay);
  const lastCommitted = useRef(externalValue);

  // Sync external resets (e.g. clearAllFilters) back to local state.
  useEffect(() => {
    if (externalValue !== lastCommitted.current) {
      setLocalValue(externalValue);
      lastCommitted.current = externalValue;
    }
  }, [externalValue]);

  // Push debounced local changes out to the caller.
  useEffect(() => {
    if (debouncedValue !== lastCommitted.current) {
      lastCommitted.current = debouncedValue;
      onCommit(debouncedValue);
    }
  }, [debouncedValue, onCommit]);

  return { localValue, setLocalValue };
}
