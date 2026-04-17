'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search1Outlined } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import FilterIcon from '@/components/FilterIcon';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden className={`animate-pulse rounded-wev-btn bg-muted/70 ${className}`} />;
}

export default function BulletinPageContentSkeleton() {
  const t = useTranslations();
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  return (
    <div data-testid={JOB_BOARD_TEST_IDS.pageLoadingState}>
      <div className="bg-card border border-border rounded-wev-card mb-4 overflow-hidden">
        <div className="p-3 sm:p-4">
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <label htmlFor="search-loading" className="sr-only">
                {t('search.label')}
              </label>
              <Lineicons
                icon={Search1Outlined}
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-wev-text-tertiary pointer-events-none"
                aria-hidden
              />
              <input
                id="search-loading"
                type="text"
                readOnly
                value=""
                placeholder={t('search.placeholder')}
                className="w-full h-10 pl-9 pr-3 border border-border rounded-wev-btn bg-card text-sm text-foreground"
              />
            </div>

            <button
              type="button"
              onClick={() => setFiltersExpanded((current) => !current)}
              className="h-10 px-3 border border-border rounded-wev-btn bg-card text-sm text-muted-foreground transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              aria-expanded={filtersExpanded}
              aria-controls="job-filters-loading"
            >
              <FilterIcon className="w-4 h-4" aria-hidden />
              <span className="max-[519px]:hidden">{t('filters.showFilters')}</span>
              <span className="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-primary text-white text-xs font-semibold">
                0
              </span>
            </button>
          </div>
        </div>

        <div className="px-3 sm:px-4 py-2.5 bg-muted border-t border-border">
          <SkeletonBlock className="h-4 w-40" />
        </div>

        {filtersExpanded && (
          <div id="job-filters-loading" className="p-6 border-t border-border space-y-4">
            <SkeletonBlock className="h-14 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonBlock className="h-28 w-full" />
              <SkeletonBlock className="h-28 w-full" />
              <SkeletonBlock className="h-40 w-full" />
              <SkeletonBlock className="h-40 w-full" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pl-2 pr-1 py-1 mb-4 gap-4">
        <SkeletonBlock className="h-4 w-44" />
        <SkeletonBlock className="h-8 w-40" />
      </div>

      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="bg-card border border-border rounded-wev-card overflow-hidden p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3 flex-1">
                <SkeletonBlock className="h-6 w-3/4" />
                <SkeletonBlock className="h-4 w-1/2" />
              </div>
              <SkeletonBlock className="h-9 w-24 shrink-0" />
            </div>
            <SkeletonBlock className="h-24 w-full rounded-wev-card" />
          </div>
        ))}
      </div>
    </div>
  );
}
