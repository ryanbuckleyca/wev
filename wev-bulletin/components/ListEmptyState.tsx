'use client';

import type { ReactNode } from 'react';
import Button from './Button';

interface ListEmptyStateProps {
  /** Message when there are truly no items (empty set / no matches without filters). */
  emptyMessage: string;
  /** Message when filters hide all available items. Should already include the total. */
  filteredMessage: string;
  hasFilters: boolean;
  totalAvailable: number;
  onClearFilters?: () => void;
  clearFiltersLabel: string;
  /** Optional extra action shown beside Clear filters (e.g. Edit profile on the job board). */
  secondaryAction?: ReactNode;
  testId?: string;
}

/**
 * Shared empty state for the job board and organization index.
 * When filters hide results, prompts to clear them; otherwise shows a plain empty message.
 */
export default function ListEmptyState({
  emptyMessage,
  filteredMessage,
  hasFilters,
  totalAvailable,
  onClearFilters,
  clearFiltersLabel,
  secondaryAction,
  testId,
}: ListEmptyStateProps) {
  const showFilterClearPrompt = hasFilters && totalAvailable > 0;

  return (
    <div
      className="bg-card border border-border rounded-wev-card p-12 text-center flex flex-col items-center justify-center gap-4"
      data-testid={testId}
    >
      {showFilterClearPrompt ? (
        <>
          <p className="text-foreground text-lg">{filteredMessage}</p>
          <div className="flex flex-col items-center gap-6 mt-2 max-w-md w-full">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              {onClearFilters && (
                <Button variant="secondary" onClick={onClearFilters} className="w-full sm:w-auto">
                  {clearFiltersLabel}
                </Button>
              )}
              {secondaryAction}
            </div>
          </div>
        </>
      ) : (
        <p className="text-foreground text-lg">{emptyMessage}</p>
      )}
    </div>
  );
}
