'use client';

import { useEffect, useRef } from 'react';
import { Command } from 'cmdk';

export interface CommandMultiSelectorOption {
  id: string;
  searchValue: string;
  content: React.ReactNode;
  isSelected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface CommandMultiSelectorProps<T> {
  selectedItems: T[];
  getItemKey: (item: T) => string;
  renderSelectedItem: (item: T, remove: () => void) => React.ReactNode;
  onRemove: (item: T) => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onInputFocus?: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  placeholder: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  options: CommandMultiSelectorOption[];
  emptyMessage?: string;
  showEmptyState?: boolean;
  loadingMessage?: string;
  showLoadingState?: boolean;
  listFooter?: React.ReactNode;
  helperText?: React.ReactNode;
  shouldFilter?: boolean;
}

export default function CommandMultiSelector<T>({
  selectedItems,
  getItemKey,
  renderSelectedItem,
  onRemove,
  inputValue,
  onInputChange,
  onInputFocus,
  inputRef,
  placeholder,
  isOpen,
  onOpenChange,
  options,
  emptyMessage,
  showEmptyState,
  loadingMessage,
  showLoadingState,
  listFooter,
  helperText,
  shouldFilter = true,
}: CommandMultiSelectorProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return;
      if (event.target instanceof Node && !containerRef.current.contains(event.target)) {
        onOpenChange(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onOpenChange]);

  return (
    <div ref={containerRef} className="space-y-3">
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedItems.map((item) => (
            <div key={getItemKey(item)}>{renderSelectedItem(item, () => onRemove(item))}</div>
          ))}
        </div>
      )}

      <div className="relative">
        <Command
          shouldFilter={shouldFilter}
          className="rounded-lg border border-[var(--border)] bg-[var(--background)]"
        >
          <Command.Input
            ref={inputRef}
            value={inputValue}
            onValueChange={onInputChange}
            onFocus={() => {
              onInputFocus?.();
            }}
            placeholder={placeholder}
            className="w-full rounded-lg bg-transparent px-4 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--text-tertiary)]"
          />

          {isOpen && (
            <Command.List className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg">
              {options.map((option) => (
                <Command.Item
                  key={option.id}
                  value={option.searchValue}
                  disabled={option.disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onSelect={() => option.onSelect()}
                  className={`cursor-pointer px-4 py-3 text-left text-sm aria-selected:bg-[var(--primary-tint)] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 ${
                    option.isSelected ? 'bg-[var(--primary-tint)]' : ''
                  }`}
                >
                  {option.content}
                </Command.Item>
              ))}

              {showEmptyState && options.length === 0 && emptyMessage && !showLoadingState && (
                <div className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                  {emptyMessage}
                </div>
              )}

              {showLoadingState && loadingMessage && (
                <div className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                  {loadingMessage}
                </div>
              )}

              {listFooter}
            </Command.List>
          )}
        </Command>
      </div>

      {helperText}
    </div>
  );
}
