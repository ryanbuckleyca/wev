'use client';

import { useState } from 'react';
import OrganizationFilters from './OrganizationFilters';
import OrganizationCard from './OrganizationCard';
import SectorIndexGrid from './SectorIndexGrid';
import Pagination from './Pagination';
import type { OrgIndexEntry } from '@/lib/organizations/types';
import type { OrganizationFilterOptions } from '@/lib/organizations/server-data';
import type { SectorIndexCard } from '@/lib/organizations/sector-index';
import { useOrganizationFilters } from '@/lib/hooks/useOrganizationFilters';
import { useOrganizationData } from '@/lib/hooks/useOrganizationData';
import { useOrganizationPagination } from '@/lib/hooks/useOrganizationPagination';
import { resolveOrgSortBy } from '@/lib/organizations/utils';
import { useTranslations } from 'next-intl';
import ListEmptyState from './ListEmptyState';
import CardListSkeleton from './CardListSkeleton';
import CountPhraseSkeleton from './CountPhraseSkeleton';
import OrgListToolbar from './OrgListToolbar';
import { useAuth } from '@/contexts/AuthContext';

interface OrganizationIndexClientProps {
  initialData: { orgs: OrgIndexEntry[]; total: number; totalAvailable?: number };
  filterOptions: OrganizationFilterOptions;
  sectorIndex: SectorIndexCard[];
  locale: string;
  initialHasMatchScores?: boolean;
}

export default function OrganizationIndexClient({
  initialData,
  filterOptions,
  sectorIndex,
  locale,
  initialHasMatchScores = false,
}: OrganizationIndexClientProps) {
  const t = useTranslations('organizations');
  const tCommon = useTranslations('common');
  const { user, loading: authLoading } = useAuth();

  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const controls = useOrganizationFilters();
  const hasMatchScores = authLoading ? initialHasMatchScores : Boolean(user);
  const effectiveSortBy = resolveOrgSortBy(controls.sortBy, hasMatchScores);

  const {
    orgs,
    total,
    totalAvailable,
    filterOptions: dynamicFilterOptions,
    loading,
    error,
  } = useOrganizationData(
    locale,
    {
      filters: controls.filters,
      currentPage: controls.currentPage,
      sortBy: effectiveSortBy,
    },
    initialData,
  );

  const { totalPages, itemsPerPage } = useOrganizationPagination(total, {
    filters: controls.filters,
    sortBy: effectiveSortBy,
    currentPage: controls.currentPage,
    setCurrentPage: controls.setCurrentPage,
  });

  const activeFilterOptions = dynamicFilterOptions ?? filterOptions;
  const showSectorIndex = !controls.hasAnyFilters && sectorIndex.length > 0;
  const showCountSkeleton = loading;

  const handleSelectSector = (sectorId: string) => {
    const next = controls.selectedSectors.includes(sectorId)
      ? controls.selectedSectors
      : [...controls.selectedSectors, sectorId];
    void controls.setSelectedSectors(next);
    void controls.setCurrentPage(1);
  };

  return (
    <div className="flex flex-col gap-0 w-full">
      <OrganizationFilters
        controls={controls}
        filterOptions={activeFilterOptions}
        filteredCount={total}
        totalCount={totalAvailable}
        loading={loading}
        filtersExpanded={filtersExpanded}
        setFiltersExpanded={setFiltersExpanded}
      />

      {showSectorIndex ? (
        <SectorIndexGrid
          sectors={sectorIndex}
          locale={locale}
          onSelectSector={handleSelectSector}
        />
      ) : (
        <div className="flex flex-col gap-4" aria-live="polite">
          {controls.hasAnyFilters && sectorIndex.length > 0 ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => controls.clearAllFilters()}
                className="text-sm text-primary hover:underline font-medium"
              >
                {t('browseSectors')}
              </button>
            </div>
          ) : null}

          <OrgListToolbar
            countContent={
              showCountSkeleton ? (
                <CountPhraseSkeleton className="w-32" />
              ) : (
                t('organizationCount', { count: total })
              )
            }
            sortBy={effectiveSortBy}
            onSortChange={(val) => {
              controls.setSortBy(val);
            }}
          />

          {error ? (
            <div className="p-4 rounded bg-destructive/10 text-destructive border border-destructive/20">
              {t('loadFailed')}
            </div>
          ) : showCountSkeleton ? (
            <CardListSkeleton count={4} />
          ) : orgs.length === 0 ? (
            <ListEmptyState
              emptyMessage={t('noOrganizations')}
              filteredMessage={t('showingFiltered', { total: totalAvailable ?? 0 })}
              hasFilters={controls.hasAnyFilters}
              totalAvailable={totalAvailable ?? 0}
              onClearFilters={controls.clearAllFilters}
              clearFiltersLabel={t('clearAllFilters')}
            />
          ) : (
            <>
              <div className="flex flex-col gap-4">
                {orgs.map((org) => (
                  <OrganizationCard
                    key={org.id}
                    org={org}
                    locale={locale}
                    sseBadgeLabel={t('sseBadgeLabel')}
                    jobCountLabel={t('jobs', { count: org.active_job_count })}
                    noDescriptionLabel={t('noDescription')}
                    websiteLabel={t('website')}
                    viewProfileLabel={t('viewProfile')}
                    showMoreLabel={tCommon('showMore')}
                    showLessLabel={tCommon('showLess')}
                    isLoggedIn={Boolean(user)}
                    selectedLanguages={controls.selectedLanguages}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-8 flex justify-center">
                  <Pagination
                    currentPage={controls.currentPage}
                    onPageChange={(p) => {
                      void controls.setCurrentPage(p);
                      window.scrollTo({ top: 0, behavior: 'auto' });
                    }}
                    totalPages={totalPages}
                    totalItems={total}
                    itemsPerPage={itemsPerPage}
                    singularKey="organizations.organization"
                    pluralKey="organizations.organizations"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
