'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { SITE_CONFIG } from '@/lib/site-config';
import Button from '@/components/Button';
import Chevron from '@/components/Chevron';
import FilterIcon from '@/components/FilterIcon';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { Search1Outlined } from '@lineiconshq/free-icons';

/**
 * Pure-CSS shimmer skeleton block.
 * Uses a moving linear-gradient over --muted / --muted-foreground so it
 * automatically respects the active theme and any token changes.
 */
function Shimmer({ className }: { className?: string }) {
  return <span aria-hidden className={`skeleton-shimmer ${className ?? ''}`} />;
}

const SKELETON_CARD_COUNT = 3;

const SkeletonRow = ({ iconW, textW, ml }: { iconW?: string; textW: string; ml?: boolean }) => (
  <div className={`flex items-center gap-2 ${ml ? 'ml-12' : ''}`}>
    {iconW && <Shimmer className={iconW} />}
    <Shimmer className={textW} />
  </div>
);

export default function BulletinPageSkeleton() {
  const t = useTranslations();

  return (
    <main
      className="min-h-screen pb-8 relative overflow-hidden"
      style={{
        background: 'var(--background)',
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-36 -left-28 h-[38rem] w-[38rem] rounded-full blur-[90px]"
          style={{
            background: 'var(--watercolor-lavender)',
            opacity: 'var(--lavender-opacity, 0.24)',
          }}
        />
        <div
          className="absolute -top-8 right-[-12rem] h-[32rem] w-[32rem] rounded-full blur-[90px]"
          style={{
            background: 'var(--watercolor-blue)',
            opacity: 'var(--blue-opacity, 0.2)',
          }}
        />
      </div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10">
        <header className="mb-8">
          <Image
            src={SITE_CONFIG.logotypeUrl}
            alt={t('home.heading')}
            width={100}
            height={40}
            unoptimized
            className="main-logo wev-logotype w-[100px] h-auto mb-2"
            style={{ height: 'auto' }}
            priority
          />
          <h1 className="text-xl font-medium text-primary">{t('home.heading')}</h1>
        </header>

        {/* Search bar + filter chips */}
        <div className="bg-card border border-border rounded-wev-card mb-4 overflow-hidden">
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
                  disabled
                  placeholder={t('search.placeholder')}
                  className="w-full h-10 pl-9 pr-10 border border-border rounded-wev-btn bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors cursor-not-allowed opacity-50"
                />
              </div>

              <button
                type="button"
                disabled
                className="h-10 px-3 border border-border rounded-wev-btn bg-card text-sm text-muted-foreground hover:border-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap opacity-50 cursor-not-allowed"
              >
                <FilterIcon className="w-4 h-4" aria-hidden />
                <span className="max-[519px]:hidden">{t('filters.showFilters')}</span>
                <span className="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-primary text-white text-xs font-semibold">
                  0
                </span>
              </button>
            </div>
          </div>

          {/* Filter summary area */}
          <div className="px-3 sm:px-4 py-2.5 bg-muted border-t border-border flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Shimmer className="w-24" />
              <Shimmer className="pill w-16" />
              <Shimmer className="pill w-12" />
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Shimmer className="w-24" />
            </div>
          </div>
        </div>

        {/* "Last updated" / sort bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pl-2 pr-1 py-1 mb-4 items-center justify-center sm:justify-start p-1 px-0.5">
          <div className="text-sm text-center sm:text-left text-xs text-muted-foreground flex items-center">
            <span className="font-semibold text-wev-brand-accent">{t('home.lastUpdated')} </span>
            <Shimmer className="inline-block w-40 ml-2" />
          </div>

          <div className="flex items-center gap-2 mt-2 sm:mt-0 sm:justify-end">
            <div className="sort-dropdown relative z-50">
              <Button
                disabled
                variant="outline"
                size="sm"
                className="flex-center-gap bg-transparent border-none text-muted-foreground p-1.5 text-xs opacity-50 cursor-not-allowed"
              >
                <span>{t('sort.label')} </span>
                <span className="font-semibold text-foreground">{t('sort.newestFirst')}</span>
                <Chevron rotated={false} />
              </Button>
            </div>

            <div className="w-0.5 h-3.5 bg-border" />

            <Button
              disabled
              variant="outline"
              size="sm"
              className="flex-center-gap bg-transparent border-none text-muted-foreground p-1.5 text-xs opacity-50 cursor-not-allowed"
            >
              <Chevron rotated={false} />
              <span>{t('expand.expandAll')}</span>
            </Button>
          </div>
        </div>

        {/* Job Cards Skeleton */}
        <div className="space-y-6">
          {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
            <article
              key={index}
              className="bg-card border border-border rounded-wev-card overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border text-sm">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Shimmer className="icon shrink-0" />
                  <Shimmer className="w-[60%]" />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Shimmer className="icon" />
                  <Shimmer className="icon" />
                </div>
              </div>

              {/* Details – matches JobCardDetails: Who / What / Where / Why / When / How Much */}
              <div className="job-details py-4 px-5 space-y-3 leading-relaxed">
                <SkeletonRow iconW="w-10" textW="w-32" />
                <SkeletonRow iconW="w-12" textW="w-52" />
                <SkeletonRow iconW="w-14" textW="w-28" />
                <div className="flex flex-col gap-1.5">
                  <SkeletonRow iconW="w-10" textW="w-[75%]" />
                  <SkeletonRow textW="w-[65%]" ml={true} />
                  <SkeletonRow textW="w-[70%]" ml={true} />
                </div>
                <SkeletonRow iconW="w-12" textW="w-36" />
                <SkeletonRow iconW="w-[4.5rem]" textW="w-40" />
              </div>

              {/* Footer – matches JobCardFooter: donut + pills */}
              <div className="px-4 py-3 bg-muted border-t border-border text-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 pr-4 border-r border-border">
                    <Shimmer className="h-8 w-8 rounded-full" />
                    <Shimmer className="w-8" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Shimmer className="pill w-20" />
                    <Shimmer className="pill w-24" />
                    <Shimmer className="pill w-16" />
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
