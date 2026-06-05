'use client';

import { useTranslations } from 'next-intl';
import Pill from './Pill';
import ButtonLink from './ButtonLink';
import FilterIcon from './FilterIcon';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { Search1Outlined, XmarkOutlined } from '@lineiconshq/free-icons';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';
import { useState, useEffect } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';

export interface ActiveFilterChip {
  id: string;
  label: string;
  onRemove?: () => void;
  title?: string;
}

interface JobSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filtersExpanded: boolean;
  onFiltersExpandedChange: (expanded: boolean) => void;
  activeFilterChips: ActiveFilterChip[];
  filteredJobsCount: number;
  totalJobsCount: number;
  hasAnyFilters: boolean;
  isSuggestedDefaults: boolean;
  onClearAllFilters: () => void;
  onApplySuggestedDefaults: () => void;
}

export default function JobSearch({
  searchQuery,
  onSearchChange,
  filtersExpanded,
  onFiltersExpandedChange,
  activeFilterChips,
  filteredJobsCount,
  totalJobsCount,
  hasAnyFilters,
  isSuggestedDefaults,
  onClearAllFilters,
  onApplySuggestedDefaults,
}: JobSearchProps) {
  const t = useTranslations();
  const placeholder = t('search.placeholder');

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debouncedQuery = useDebounce(localQuery, 300);

  // Sync external changes (like clear all filters) to local state
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  // Sync local changes to external state after debounce
  useEffect(() => {
    if (debouncedQuery !== searchQuery) {
      onSearchChange(debouncedQuery);
    }
  }, [debouncedQuery, onSearchChange, searchQuery]);

  return (
    <>
      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <label htmlFor="search" className="sr-only">
              {t('search.label')}
            </label>
            <Lineicons
              icon={Search1Outlined}
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-wev-text-tertiary pointer-events-none"
              aria-hidden
            />
            <input
              type="text"
              id="search"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full h-10 pl-9 pr-10 border border-border rounded-wev-btn bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
            {localQuery && (
              <button
                type="button"
                onClick={() => setLocalQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-wev-text-tertiary hover:text-foreground transition-colors p-1"
                aria-label={t('search.clear')}
              >
                <Lineicons icon={XmarkOutlined} size={16} aria-hidden />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onFiltersExpandedChange(!filtersExpanded)}
            data-testid={JOB_BOARD_TEST_IDS.filtersToggle}
            className="h-10 px-3 border border-border rounded-wev-btn bg-card text-sm text-muted-foreground hover:border-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            aria-expanded={filtersExpanded}
            aria-controls="job-filters-content"
          >
            <FilterIcon className="w-4 h-4" aria-hidden />
            <span className="max-[519px]:hidden">
              {filtersExpanded ? t('filters.hideFilters') : t('filters.showFilters')}
            </span>
            <span className="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-primary text-white text-xs font-semibold">
              {activeFilterChips.length}
            </span>
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-4 py-2.5 bg-muted border-t border-border flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            <strong className="font-semibold text-foreground">{filteredJobsCount}</strong>{' '}
            {t('pagination.of')} {totalJobsCount}{' '}
            {totalJobsCount === 1 ? t('pagination.job') : t('pagination.jobs')}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFilterChips.map((chip) => (
              <Pill
                key={chip.id}
                removable
                onRemove={chip.onRemove}
                removeAriaLabel={t('ariaLabels.pill.remove', { label: chip.label })}
                size="sm"
                variant="secondary"
                className="text-xs"
              >
                {chip.label}
              </Pill>
            ))}
          </div>
        </div>
        {(hasAnyFilters || !isSuggestedDefaults) && (
          <div className="flex flex-wrap items-center gap-3">
            {hasAnyFilters && (
              <ButtonLink onClick={onClearAllFilters} tone="muted" size="xs" className="underline">
                {t('filters.clearAllFilters')}
              </ButtonLink>
            )}
            {!isSuggestedDefaults && (
              <ButtonLink
                onClick={onApplySuggestedDefaults}
                tone="muted"
                size="xs"
                className="underline"
              >
                {t('filters.useSuggestedFilters')}
              </ButtonLink>
            )}
          </div>
        )}
      </div>
    </>
  );
}
