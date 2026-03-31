'use client';

import { useLocale } from 'next-intl';
import BulletinPageView from '@/components/BulletinPageView';
import { useAuth } from '@/contexts/AuthContext';
import { useBulletinData } from '@/lib/hooks/useBulletinData';
import { useBulletinFilters } from '@/lib/hooks/useBulletinFilters';
import { useProfile } from '@/contexts/ProfileContext';

export default function Home() {
  const locale = useLocale();
  const { role, user } = useAuth();
  const { profile } = useProfile();
  const filters = useBulletinFilters();
  const data = useBulletinData(locale, user?.id ?? null, {
    filters: filters.filters,
    sortBy: filters.sortBy,
    currentPage: filters.currentPage,
    setCurrentPage: filters.setCurrentPage,
  });

  return (
    <BulletinPageView
      isAdmin={role === 'admin'}
      isLoggedIn={!!user}
      filters={filters}
      data={data}
    />
  );
}
