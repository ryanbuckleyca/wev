'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { SITE_CONFIG } from '@/lib/site-config';
import Button from '@/components/Button';
import Chevron from '@/components/Chevron';
import CardListSkeleton from '@/components/CardListSkeleton';
import SearchCardSkeleton from '@/components/SearchCardSkeleton';
import TextSkeleton from '@/components/TextSkeleton';
import WatercolorBackground from '@/components/WatercolorBackground';

const SKELETON_CARD_COUNT = 3;

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
        <WatercolorBackground />
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

        <SearchCardSkeleton
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          inputId="search"
          filtersLabel={t('filters.showFilters')}
        />

        {/* "Last updated" / sort bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pl-2 pr-1 py-1 mb-4 items-center justify-center sm:justify-start p-1 px-0.5">
          <div className="text-sm text-center sm:text-left text-xs text-muted-foreground flex items-center">
            <span className="font-semibold text-wev-brand-accent">{t('home.lastUpdated')} </span>
            <TextSkeleton placeholder="March 28, 2026, 9:00 AM EDT" />
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

        <CardListSkeleton count={SKELETON_CARD_COUNT} />
      </div>
    </main>
  );
}
