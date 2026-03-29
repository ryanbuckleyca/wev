'use client';

import { useTranslations } from 'next-intl';
import Button from './Button';

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

  const getPageNumbers = (maxVisible = 5) => {
    const pages: (number | string)[] = [];

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (maxVisible <= 3) {
        // mobile: only show current page in the middle
        start = currentPage;
        end = currentPage;
      } else {
        if (currentPage <= 3) {
          end = Math.min(totalPages - 1, maxVisible - 1);
        }
        if (currentPage >= totalPages - 2) {
          start = Math.max(2, totalPages - (maxVisible - 2));
        }
      }

      if (start > 2) pages.push('...');

      for (let i = start; i <= end; i++) {
        if (i !== 1 && i !== totalPages) pages.push(i);
      }

      if (end < totalPages - 1) pages.push('...');

      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex flex-col items-center gap-3 py-4 mx-auto w-full">
      <div className="text-sm text-foreground text-center">
        {t('pagination.showing')} {startItem}-{endItem} {t('pagination.of')} {totalItems}{' '}
        {totalItems === 1 ? t('pagination.job') : t('pagination.jobs')}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          variant="outline"
          size="sm"
          fullWidth={false}
        >
          {t('pagination.previous')}
        </Button>

        {/* mobile: 3 visible, sm+: 5 visible */}
        <div className="flex items-center gap-1 sm:hidden">
          {getPageNumbers(3).map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`ellipsis-m-${idx}`} className="px-1 text-muted-foreground text-sm">
                  ...
                </span>
              );
            }
            const pageNum = page as number;
            return (
              <Button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                variant={pageNum === currentPage ? 'primary' : 'outline'}
                size="sm"
                fullWidth={false}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>

        <div className="hidden sm:flex items-center gap-1.5">
          {getPageNumbers(5).map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`ellipsis-d-${idx}`} className="px-2 text-muted-foreground">
                  ...
                </span>
              );
            }
            const pageNum = page as number;
            return (
              <Button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                variant={pageNum === currentPage ? 'primary' : 'outline'}
                size="sm"
                fullWidth={false}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>

        <Button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          variant="outline"
          size="sm"
          fullWidth={false}
        >
          {t('pagination.next')}
        </Button>
      </div>
    </div>
  );
}
