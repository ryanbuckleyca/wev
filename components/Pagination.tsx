'use client';

import { useTranslations } from 'next-intl';
import ResponsivePagination from 'react-responsive-pagination';
import { twMerge } from 'tailwind-merge';
import { dropEllipsis } from 'react-responsive-pagination/narrowBehaviour';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}: PaginationProps) {
  const t = useTranslations();
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalPages <= 1) {
    return (
      <div className="text-sm text-foreground text-center py-4">
        {t('pagination.showing')} {totalItems}{' '}
        {totalItems === 1 ? t('pagination.job') : t('pagination.jobs')}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4 w-full">
      <div className="text-sm text-foreground text-center">
        {t('pagination.showing')} {startItem}-{endItem} {t('pagination.of')} {totalItems}{' '}
        {totalItems === 1 ? t('pagination.job') : t('pagination.jobs')}
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
