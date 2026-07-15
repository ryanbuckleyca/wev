'use client';

import { useState } from 'react';
import OrganizationFilters from './OrganizationFilters';
import OrganizationCard from './OrganizationCard';
import Pagination from './Pagination';
import type { OrgIndexEntry } from '@/lib/organizations/types';
import type { OrganizationFilterOptions } from '@/lib/organizations/server-data';
import { useOrganizationFilters } from '@/lib/hooks/useOrganizationFilters';
import { useOrganizationData } from '@/lib/hooks/useOrganizationData';
import { ORG_JOBS_PER_PAGE } from '@/lib/organizations/constants';
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
  locale: string;
  initialHasMatchScores?: boolean;
}

export default function OrganizationIndexClient({
  initialData,
  filterOptions,
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

  const { orgs, total, totalAvailable, loading, error } = useOrganizationData(
    locale,
    {
      filters: controls.filters,
      currentPage: controls.currentPage,
      sortBy: effectiveSortBy,
    },
    initialData,
  );

  const totalPages = Math.max(1, Math.ceil(total / ORG_JOBS_PER_PAGE));
  const showCountSkeleton = loading && orgs.length === 0;

  return (
    <div className="flex flex-col gap-0 w-full">
      <OrganizationFilters
        controls={controls}
        filterOptions={filterOptions}
        filteredCount={total}
        totalCount={totalAvailable}
        loading={loading}
        filtersExpanded={filtersExpanded}
        setFiltersExpanded={setFiltersExpanded}
      />

      <div className="flex flex-col gap-4" aria-live="polite">
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
            controls.setCurrentPage(1);
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
                  itemsPerPage={ORG_JOBS_PER_PAGE}
                  singularKey="organizations.organization"
                  pluralKey="organizations.organizations"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
