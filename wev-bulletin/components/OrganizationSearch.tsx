'use client';

import { useTranslations } from 'next-intl';
import Pill from './Pill';
import ButtonLink from './ButtonLink';
import FilterIcon from './FilterIcon';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { Search1Outlined, XmarkOutlined } from '@lineiconshq/free-icons';
import { useState, useEffect, useRef } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';
import type { ActiveFilterChip } from './JobSearch'; // Reuse the interface

interface OrganizationSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filtersExpanded: boolean;
  onFiltersExpandedChange: (expanded: boolean) => void;
  activeFilterChips: ActiveFilterChip[];
  filteredCount: number;
  totalCount: number;
  loading?: boolean;
  hasAnyFilters: boolean;
  onClearAllFilters: () => void;
}

export default function OrganizationSearch({
  searchQuery,
  onSearchChange,
  filtersExpanded,
  onFiltersExpandedChange,
  activeFilterChips,
  filteredCount,
  totalCount,
  loading = false,
  hasAnyFilters,
  onClearAllFilters,
}: OrganizationSearchProps) {
  const t = useTranslations('organizations');
  const placeholder = t('searchPlaceholder');

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debouncedQuery = useDebounce(localQuery, 300);
  const lastPropQuery = useRef(searchQuery);

  useEffect(() => {
    if (searchQuery !== lastPropQuery.current) {
      setLocalQuery(searchQuery);
      lastPropQuery.current = searchQuery;
    }
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedQuery !== lastPropQuery.current) {
      lastPropQuery.current = debouncedQuery;
      onSearchChange(debouncedQuery);
    }
  }, [debouncedQuery, onSearchChange]);

  return (
    <>
      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <label htmlFor="search" className="sr-only">
              {t('searchLabel')}
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
                aria-label={t('clearSearch')}
              >
                <Lineicons icon={XmarkOutlined} size={16} aria-hidden />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onFiltersExpandedChange(!filtersExpanded)}
            className="h-10 px-3 border border-border rounded-wev-btn bg-card text-sm text-muted-foreground hover:border-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            aria-expanded={filtersExpanded}
            aria-controls="org-filters-content"
          >
            <FilterIcon className="w-4 h-4" aria-hidden />
            <span className="max-[519px]:hidden">
              {filtersExpanded ? t('hideFilters') : t('showFilters')}
            </span>
            <span className="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-primary text-white text-xs font-semibold">
              {activeFilterChips.length}
            </span>
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-4 py-2.5 bg-muted border-t border-border flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {loading ? (
            <span className="skeleton-pulse w-28 rounded" role="status" aria-label="Loading..." />
          ) : (
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              <strong className="font-semibold text-foreground">{filteredCount}</strong>{' '}
              {t('of')} {totalCount}{' '}
              {totalCount === 1 ? t('organization') : t('organizations')}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFilterChips.map((chip) => (
              <Pill
                key={chip.id}
                removable
                onRemove={chip.onRemove}
                size="sm"
                variant="secondary"
                className="text-xs"
              >
                {chip.label}
              </Pill>
            ))}
          </div>
        </div>
        {hasAnyFilters && (
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink onClick={onClearAllFilters} tone="muted" size="xs" className="underline">
              {t('clearAllFilters')}
            </ButtonLink>
          </div>
        )}
      </div>
    </>
  );
}
