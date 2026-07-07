import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface SimplePaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
}

function pageHref(baseUrl: string, page: number): string {
  const url = new URL(baseUrl, 'http://localhost');
  url.searchParams.set('page', String(page));
  return url.pathname + url.search;
}

export default function SimplePagination({
  currentPage,
  totalPages,
  baseUrl,
}: SimplePaginationProps) {
  const t = useTranslations('pagination');

  if (totalPages <= 1) return null;

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const linkClass =
    'px-4 py-2 text-sm font-medium border border-border rounded-wev-btn bg-background text-foreground hover:bg-muted transition-colors';
  const disabledClass =
    'px-4 py-2 text-sm font-medium border border-border rounded-wev-btn bg-muted text-muted-foreground opacity-50 cursor-not-allowed';

  return (
    <nav aria-label={t('paginationLabel')} className="flex items-center justify-center gap-4 py-6">
      {hasPrev ? (
        <Link href={pageHref(baseUrl, currentPage - 1)} className={linkClass}>
          {t('previous')}
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          {t('previous')}
        </span>
      )}

      <span className="text-sm font-medium text-foreground">
        {t('pageOf', { current: currentPage, total: totalPages })}
      </span>

      {hasNext ? (
        <Link href={pageHref(baseUrl, currentPage + 1)} className={linkClass}>
          {t('next')}
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          {t('next')}
        </span>
      )}
    </nav>
  );
}
