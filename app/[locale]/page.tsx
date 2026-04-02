'use client';

import { useRef } from 'react';
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

  // DEBUG: count renders
  const renderCount = useRef(0);
  renderCount.current += 1;
  if (renderCount.current > 20) {
    console.error('[Home] excessive renders:', renderCount.current);
  } else {
    console.debug('[Home] render #', renderCount.current);
  }

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
