'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Pagination from '@/components/Pagination';

interface UrlSyncedPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  singularKey?: string;
  pluralKey?: string;
}

/**
 * Shared Pagination control that writes `?page=` into the current path.
 *
 * Other query params are preserved, so filters such as the admin
 * `?review=1` survive page changes.
 */
export default function UrlSyncedPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  singularKey,
  pluralKey,
}: UrlSyncedPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={totalItems}
      itemsPerPage={itemsPerPage}
      singularKey={singularKey}
      pluralKey={pluralKey}
      onPageChange={(page) => {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        if (page > 1) {
          params.set('page', String(page));
        } else {
          params.delete('page');
        }
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
        window.scrollTo({ top: 0, behavior: 'auto' });
      }}
    />
  );
}
