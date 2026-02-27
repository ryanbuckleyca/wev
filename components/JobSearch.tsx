'use client'

import FilterPill from './FilterPill'

export interface ActiveFilterChip {
  id: string
  label: string
  onRemove?: () => void
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
  return (
    <>
      <div className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1">
            <label htmlFor="search" className="sr-only">
              Search jobs
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
              placeholder="Search by job title, organization, location..."
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden>
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="8" y1="12" x2="16" y2="12" />
              <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
            <span>{filtersExpanded ? 'Hide filters' : 'Filters'}</span>
            <span className="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-wev-primary text-white text-xs font-semibold">
              {activeFilterChips.length}
            </span>
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-4 py-2.5 bg-wev-surface-tint border-t border-wev-border flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-wev-text-secondary whitespace-nowrap">
            <strong className="font-semibold text-wev-text-primary">{filteredJobsCount}</strong> of {totalJobsCount}{' '}
            {totalJobsCount === 1 ? 'job' : 'jobs'}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFilterChips.map((chip) => (
              <FilterPill
                key={chip.id}
                label={chip.label}
                onRemove={chip.onRemove}
              />
            ))}
          </div>
        </div>
        {(hasAnyFilters || !isSuggestedDefaults) && (
          <div className="flex flex-wrap items-center gap-3">
            {hasAnyFilters && (
              <button
                type="button"
                onClick={onClearAllFilters}
                className="text-xs text-wev-text-tertiary hover:text-wev-accent underline"
              >
                Show all jobs
              </button>
            )}
            {!isSuggestedDefaults && (
              <button
                type="button"
                onClick={onApplySuggestedDefaults}
                className="text-xs text-wev-text-tertiary hover:text-wev-accent underline"
              >
                Use suggested filters
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
