'use client';

import { useLocale } from 'next-intl';
import BulletinPageView from '@/components/BulletinPageView';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useBulletinData } from '@/lib/hooks/useBulletinData';
import { useBulletinFilters } from '@/lib/hooks/useBulletinFilters';

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
      profile={profile}
      filters={filters}
      data={data}
    />
  );
}
