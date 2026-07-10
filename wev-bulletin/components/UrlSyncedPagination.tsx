'use client';

import { useRouter, usePathname } from 'next/navigation';
import Pagination from '@/components/Pagination';

interface UrlSyncedPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  singularKey?: string;
  pluralKey?: string;
}

/** Shared Pagination control that writes `?page=` into the current path. */
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

  return (
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={totalItems}
      itemsPerPage={itemsPerPage}
      singularKey={singularKey}
      pluralKey={pluralKey}
      onPageChange={(page) => {
        const params = new URLSearchParams();
        if (page > 1) params.set('page', String(page));
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
        window.scrollTo({ top: 0, behavior: 'auto' });
      }}
    />
  );
}
