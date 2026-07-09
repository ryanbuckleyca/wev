'use client';

/**
 * Shared search bar used by both JobSearch and OrganizationSearch.
 * Renders a debounced text input, a filter toggle button, an active-filter
 * chip strip, and clear / suggested-default action links.
 */

import { useTranslations } from 'next-intl';
import Pill from './Pill';
import ButtonLink from './ButtonLink';
import FilterToggleButton from './FilterToggleButton';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { Search1Outlined, XmarkOutlined } from '@lineiconshq/free-icons';
import { useDebouncedInput } from '@/lib/hooks/useDebouncedInput';
import type { ActiveFilterChip } from './JobSearch';

export interface SearchBarCountConfig {
  /** The filtered/active count */
  filtered: number;
  /** The total (unfiltered) count */
  total: number;
  /** i18n key for the "of" separator, e.g. 'pagination.of' or 'organizations.of' */
  ofKey: string;
  /** i18n key for the singular noun, e.g. 'pagination.job' or 'organizations.organization' */
  singularKey: string;
  /** i18n key for the plural noun, e.g. 'pagination.jobs' or 'organizations.organizations' */
  pluralKey: string;
}

interface SearchBarProps {
  /** Committed (external) search query value */
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** i18n key for the input's accessible label */
  labelKey: string;
  /** i18n key for the input placeholder */
  placeholderKey: string;
  /** HTML id for the input element */
  inputId: string;
  filtersExpanded: boolean;
  onFiltersExpandedChange: (expanded: boolean) => void;
  /** aria-controls id of the collapsible filter panel */
  filterControlsId: string;
  activeFilterChips: ActiveFilterChip[];
  countConfig: SearchBarCountConfig;
  loading?: boolean;
  hasAnyFilters: boolean;
  isSuggestedDefaults: boolean;
  onClearAllFilters: () => void;
  onApplySuggestedDefaults: () => void;
  /** Attach data-testid to the filter toggle (job board only) */
  filterToggleWithTestId?: boolean;
}

export default function SearchBar({
  searchQuery,
  onSearchChange,
  labelKey,
  placeholderKey,
  inputId,
  filtersExpanded,
  onFiltersExpandedChange,
  filterControlsId,
  activeFilterChips,
  countConfig,
  loading = false,
  hasAnyFilters,
  isSuggestedDefaults,
  onClearAllFilters,
  onApplySuggestedDefaults,
  filterToggleWithTestId = false,
}: SearchBarProps) {
  const t = useTranslations();

  const { localValue: localQuery, setLocalValue: setLocalQuery } = useDebouncedInput(
    searchQuery,
    300,
    onSearchChange,
  );

  const { filtered, total, ofKey, singularKey, pluralKey } = countConfig;

  return (
    <>
      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <label htmlFor={inputId} className="sr-only">
              {t(labelKey)}
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
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder={t(placeholderKey)}
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
            controlsId={filterControlsId}
            withTestId={filterToggleWithTestId}
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
              <strong className="font-semibold text-foreground">{filtered}</strong>{' '}
              {t(ofKey)} {total}{' '}
              {total === 1 ? t(singularKey) : t(pluralKey)}
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
