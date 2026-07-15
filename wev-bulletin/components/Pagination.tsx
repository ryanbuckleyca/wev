'use client';

import { useTranslations } from 'next-intl';
import ResponsivePagination from 'react-responsive-pagination';
import { twMerge } from 'tailwind-merge';
import { dropEllipsis } from 'react-responsive-pagination/narrowBehaviour';

import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

interface PaginationProps {
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  /** next-intl key for singular item noun, relative to root. Defaults to jobs. */
  singularKey?: string;
  /** next-intl key for plural item noun, relative to root. Defaults to jobs. */
  pluralKey?: string;
}

export default function Pagination({
  currentPage,
  onPageChange,
  totalPages,
  totalItems,
  itemsPerPage,
  singularKey = 'pagination.job',
  pluralKey = 'pagination.jobs',
}: PaginationProps) {
  const t = useTranslations();
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  const itemLabel = totalItems === 1 ? t(singularKey) : t(pluralKey);

  if (totalPages <= 1) {
    return (
      <div className="text-sm text-foreground text-center py-4">
        <span data-testid={JOB_BOARD_TEST_IDS.paginationSummary}>
          {t('pagination.showing')} {totalItems} {itemLabel}
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
        {itemLabel}
      </div>

      <div className="w-full">
        <ResponsivePagination
          current={currentPage}
          total={totalPages}
          onPageChange={onPageChange}
          previousLabel="&lsaquo;"
          nextLabel="&rsaquo;"
          ariaPreviousLabel={t('pagination.previous')}
          ariaNextLabel={t('pagination.next')}
          narrowBehaviour={dropEllipsis}
          classMerge={twMerge}
          containerClassName="flex justify-center"
          pageItemClassName="inline-flex items-center border border-border -ml-px first:ml-0 font-medium transition-colors overflow-hidden text-xs"
          activeItemClassName="bg-primary border-primary text-primary-foreground z-10"
          inactiveItemClassName="bg-background text-muted-foreground hover:bg-muted"
          disabledItemClassName="opacity-40 pointer-events-none bg-background text-muted-foreground"
          previousClassName="rounded-tl-[12px] rounded-bl-[12px] text-lg pb-1"
          nextClassName="rounded-tr-[12px] rounded-br-[12px] text-lg pb-1"
          pageLinkClassName="px-3 py-1.5 leading-none flex items-center justify-center h-full"
        />
      </div>
    </div>
  );
}
