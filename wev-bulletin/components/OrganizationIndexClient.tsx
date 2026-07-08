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
import SortDropdown from './SortDropdown';
import { useAuth } from '@/contexts/AuthContext';
import ButtonLink from './ButtonLink';

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

      <div className="flex flex-col gap-6" aria-live="polite">
        {error ? (
          <div className="p-4 rounded bg-destructive/10 text-destructive border border-destructive/20">
            {t('loadFailed')}
          </div>
        ) : loading && orgs.length === 0 ? (
          <div className="flex flex-col gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-48 bg-muted rounded-wev-card animate-pulse border border-border"
              />
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-semibold text-foreground mb-2">{t('noActiveListings')}</p>
            {controls.hasAnyFilters && (
              <ButtonLink
                onClick={controls.clearAllFilters}
                tone="muted"
                size="sm"
                className="mt-4 underline"
              >
                {t('clearAllFilters')}
              </ButtonLink>
            )}
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center px-2">
              <div className="text-sm text-muted-foreground" aria-live="polite">
                {total} {total === 1 ? t('organization') : t('organizations')}
              </div>
              <SortDropdown
                sortBy={effectiveSortBy}
                onChange={(val) => {
                  controls.setSortBy(val);
                  controls.setCurrentPage(1);
                }}
                showMatchOption={hasMatchScores}
                optionValues={['value-match-desc', 'org-asc', 'org-desc']}
              />
            </div>
            <div className="flex flex-col gap-4">
              {orgs.map((org) => (
                <OrganizationCard
                  key={org.id}
                  org={org}
                  locale={locale}
                  sseBadgeLabel={t('sseBadgeLabel')}
                  jobCountLabel={t('jobs', { count: org.active_job_count })}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex justify-center">
                <Pagination
                  currentPage={controls.currentPage}
                  onPageChange={(p) => {
                    void controls.setCurrentPage(p);
                    window.scrollTo({ top: 0, behavior: 'instant' });
                  }}
                  totalPages={totalPages}
                  totalItems={total}
                  itemsPerPage={ORG_JOBS_PER_PAGE}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
