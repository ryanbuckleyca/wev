'use client';

import { useTranslations } from 'next-intl';
import Pill from './Pill';
import ButtonLink from './ButtonLink';
import FilterToggleButton from './FilterToggleButton';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { Search1Outlined, XmarkOutlined } from '@lineiconshq/free-icons';
import { useDebouncedInput } from '@/lib/hooks/useDebouncedInput';
import type { ActiveFilterChip } from './JobSearch';

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
  isSuggestedDefaults: boolean;
  onClearAllFilters: () => void;
  onApplySuggestedDefaults: () => void;
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
  isSuggestedDefaults,
  onClearAllFilters,
  onApplySuggestedDefaults,
}: OrganizationSearchProps) {
  const t = useTranslations();

  const { localValue: localQuery, setLocalValue: setLocalQuery } = useDebouncedInput(
    searchQuery,
    300,
    onSearchChange,
  );

  return (
    <>
      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <label htmlFor="org-search" className="sr-only">
              {t('organizations.searchLabel')}
            </label>
            <Lineicons
              icon={Search1Outlined}
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-wev-text-tertiary pointer-events-none"
              aria-hidden
            />
            <input
              type="text"
              id="org-search"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder={t('organizations.searchPlaceholder')}
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

          <FilterToggleButton
            filtersExpanded={filtersExpanded}
            onToggle={() => onFiltersExpandedChange(!filtersExpanded)}
            activeCount={activeFilterChips.length}
            controlsId="org-filters-content"
          />
        </div>
      </div>

      <div className="px-3 sm:px-4 py-2.5 bg-muted border-t border-border flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {loading ? (
            <span
              className="skeleton-pulse w-28 rounded"
              role="status"
              aria-label={t('jobListings.loading')}
            />
          ) : (
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              <strong className="font-semibold text-foreground">{filteredCount}</strong>{' '}
              {t('organizations.of')} {totalCount}{' '}
              {totalCount === 1 ? t('organizations.organization') : t('organizations.organizations')}
            </span>
          )}
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
