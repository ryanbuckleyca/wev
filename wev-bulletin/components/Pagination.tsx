'use client';

import { useTranslations } from 'next-intl';

import { useBulletinFilterContext } from '@/contexts/BulletinFilterContext';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

interface PaginationProps {
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

type PaginationToken = number | 'ellipsis';

export function buildPaginationTokens(currentPage: number, totalPages: number): PaginationToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const tokens: PaginationToken[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    tokens.push('ellipsis');
  }

  for (let page = start; page <= end; page += 1) {
    tokens.push(page);
  }

  if (end < totalPages - 1) {
    tokens.push('ellipsis');
  }

  tokens.push(totalPages);
  return tokens;
}

export default function Pagination({ totalPages, totalItems, itemsPerPage }: PaginationProps) {
  const { currentPage, setCurrentPage: onPageChange } = useBulletinFilterContext();
  const t = useTranslations();
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  const pageTokens = buildPaginationTokens(currentPage, totalPages);

  const baseButtonClasses =
    'inline-flex items-center justify-center border border-border -ml-px first:ml-0 font-medium transition-colors overflow-hidden text-xs px-3 py-1.5 leading-none h-full';

  if (totalPages <= 1) {
    return (
      <div className="text-sm text-foreground text-center py-4">
        <span data-testid={JOB_BOARD_TEST_IDS.paginationSummary}>
          {t('pagination.showing')} {totalItems}{' '}
          {totalItems === 1 ? t('pagination.job') : t('pagination.jobs')}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4 w-full">
      <div
        className="text-sm text-foreground text-center"
        data-testid={JOB_BOARD_TEST_IDS.paginationSummary}
      >
        {t('pagination.showing')} {startItem}-{endItem} {t('pagination.of')} {totalItems}{' '}
        {totalItems === 1 ? t('pagination.job') : t('pagination.jobs')}
      </div>

      <nav className="w-full flex justify-center" aria-label="Pagination">
        <button
          type="button"
          aria-label={t('pagination.previous')}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`${baseButtonClasses} rounded-tl-[12px] rounded-bl-[12px] text-lg pb-1 ${
            currentPage === 1
              ? 'opacity-40 pointer-events-none bg-background text-muted-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          &lsaquo;
        </button>

        {pageTokens.map((token, index) => {
          if (token === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${index}`}
                className={`${baseButtonClasses} bg-background text-muted-foreground cursor-default`}
                aria-hidden="true"
              >
                …
              </span>
            );
          }

          const isActive = token === currentPage;
          return (
            <button
              key={token}
              type="button"
              onClick={() => onPageChange(token)}
              aria-current={isActive ? 'page' : undefined}
              className={`${baseButtonClasses} ${
                isActive
                  ? 'bg-primary border-primary text-primary-foreground z-10'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {token}
            </button>
          );
        })}

        <button
          type="button"
          aria-label={t('pagination.next')}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`${baseButtonClasses} rounded-tr-[12px] rounded-br-[12px] text-lg pb-1 ${
            currentPage === totalPages
              ? 'opacity-40 pointer-events-none bg-background text-muted-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          &rsaquo;
        </button>
      </nav>
    </div>
  );
}
