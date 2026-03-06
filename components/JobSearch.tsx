'use client'

import { useTranslations } from 'next-intl'
import Pill from './Pill'
import ButtonLink from './ButtonLink'
import FilterIcon from './FilterIcon'

export interface ActiveFilterChip {
  id: string
  label: string
  onRemove?: () => void
  title?: string
}

interface JobSearchProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  filtersExpanded: boolean
  onFiltersExpandedChange: (expanded: boolean) => void
  activeFilterChips: ActiveFilterChip[]
  filteredJobsCount: number
  totalJobsCount: number
  hasAnyFilters: boolean
  isSuggestedDefaults: boolean
  onClearAllFilters: () => void
  onApplySuggestedDefaults: () => void
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
  const t = useTranslations()
  const placeholder = t('search.placeholder')
  return (
    <>
      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <label htmlFor="search" className="sr-only">
              {t('search.label')}
            </label>
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wev-text-tertiary pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              id="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={placeholder}
              className="w-full h-10 pl-9 pr-3 border border-wev-border rounded-wev-btn bg-wev-surface text-sm text-wev-text-primary focus:outline-none focus:ring-2 focus:ring-wev-primary/20 focus:border-wev-primary transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={() => onFiltersExpandedChange(!filtersExpanded)}
            className="h-10 px-3 border border-wev-border rounded-wev-btn bg-wev-surface text-sm text-wev-text-secondary hover:border-wev-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            aria-expanded={filtersExpanded}
            aria-controls="job-filters-content"
          >
            <FilterIcon className="w-4 h-4" aria-hidden />
            <span className="max-[519px]:hidden">{filtersExpanded ? t('filters.hideFilters') : t('filters.showFilters')}</span>
            <span className="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-wev-primary text-white text-xs font-semibold">
              {activeFilterChips.length}
            </span>
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-4 py-2.5 bg-wev-surface-tint border-t border-wev-border flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-wev-text-secondary whitespace-nowrap">
            <strong className="font-semibold text-wev-text-primary">{filteredJobsCount}</strong> {t('pagination.of')} {totalJobsCount}{' '}
            {totalJobsCount === 1 ? t('pagination.job') : t('pagination.jobs')}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFilterChips.map((chip) => (
              <Pill
                key={chip.id}
                removable
                onRemove={chip.onRemove}
                size="sm"
                variant="secondary"
                className="text-xs"
                title={chip.title}
              >
                {chip.label}
              </Pill>
            ))}
          </div>
        </div>
        {(hasAnyFilters || !isSuggestedDefaults) && (
          <div className="flex flex-wrap items-center gap-3">
            {hasAnyFilters && (
              <ButtonLink
                onClick={onClearAllFilters}
                tone="muted"
                size="xs"
                className="underline"
              >
                {t('filters.showAllJobs')}
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
  )
}
